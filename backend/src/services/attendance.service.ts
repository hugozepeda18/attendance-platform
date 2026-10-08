import { AttendanceStatus, Prisma, SchoolConfig, Student, UpdatedByRole } from '@prisma/client';
import { NotifierService, notifier } from './notifier';
import { nonSchoolDay } from './calendar.service';
import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import { findStudentByCredentialUid, findStudentsWithoutRecordForDate } from '../repositories/student.repository';
import {
  findRecordByStudentAndDate,
  createAttendanceRecord,
  updateAttendanceRecord,
  findScanEvent,
  createScanEvent,
} from '../repositories/attendance.repository';

// start..start+grace → PRESENT; until start+absenceCutoff → TARDY; from the cutoff on → OUTSIDE_WINDOW:
// nothing is saved and the gate sends the student to the office (decision C, 2026-10-07).
export function evaluateStatus(
  scanTime: Date,
  schoolStartTime: string,
  tardyGraceMinutes: number,
  absenceCutoffMinutes: number,
  timezone: string,
): 'PRESENT' | 'TARDY' | 'OUTSIDE_WINDOW' {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(scanTime);

  const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
  const scanMinutes = hour * 60 + minute;

  const [startHour, startMinute] = schoolStartTime.split(':').map(Number);
  const start = startHour * 60 + startMinute;

  if (scanMinutes >= start + absenceCutoffMinutes) return 'OUTSIDE_WINDOW';
  return scanMinutes <= start + tardyGraceMinutes ? 'PRESENT' : 'TARDY';
}

export function getDateInTimezone(timezone: string, refDate?: Date): Date {
  const now = refDate ?? new Date();
  // en-CA locale produces YYYY-MM-DD, which Prisma serializes correctly as @db.Date
  const localDateStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  return new Date(localDateStr + 'T00:00:00.000Z');
}

export type ScanResultCode = 'PRESENT' | 'TARDY' | 'ALREADY_SCANNED' | 'OUTSIDE_WINDOW' | 'NOT_FOUND';

export interface ScanInput {
  credentialUid: string;
  eventId?: string; // device-generated; replays of the same eventId return the stored outcome
  scannedAt?: Date; // device time of the scan (offline queue)
  sentAt?: Date; // device time when the upload was sent, used to correct a drifting clock
}

export interface ScanOutcome {
  eventId: string | null;
  result: ScanResultCode;
  studentName: string | null;
  grade: number | null;
  group: string | null;
  scannedAt: string;
  clockSkew: boolean;
}

const MAX_FUTURE_MS = 2 * 60_000;
const MAX_PAST_MS = 24 * 60 * 60_000;
const ENTRY_MESSAGE_MAX_AGE_MS = 2 * 60 * 60_000;

// Device time → server time. The whole upload is shifted by (server now − device sentAt);
// anything still outside [now − 24 h, now + 2 min] falls back to server time and is flagged.
export function resolveScanTime(now: Date, scannedAt?: Date, sentAt?: Date): { at: Date; clockSkew: boolean } {
  if (!scannedAt) return { at: now, clockSkew: false };
  const offset = sentAt ? now.getTime() - sentAt.getTime() : 0;
  const at = new Date(scannedAt.getTime() + offset);
  const ok = at.getTime() <= now.getTime() + MAX_FUTURE_MS && at.getTime() >= now.getTime() - MAX_PAST_MS;
  return ok ? { at, clockSkew: false } : { at: now, clockSkew: true };
}

// One place for reader quirks: whitespace, framing characters (e.g. ";0042?" from track-2 readers),
// and, when the school's roster lost them in Excel, leading zeros. Roster imports must use the same function.
export function normalizeCredential(raw: string, dropLeadingZeros: boolean): string {
  const trimmed = raw.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  return dropLeadingZeros ? trimmed.replace(/^0+(?=.)/, '') : trimmed;
}

export async function processScan(
  schoolId: string,
  input: ScanInput,
  notifierService: NotifierService = notifier,
): Promise<ScanOutcome> {
  if (input.eventId) {
    const seen = await findScanEvent(schoolId, input.eventId);
    if (seen) return seen.result as unknown as ScanOutcome;
  }

  const config = await getSchoolConfig(schoolId);
  if (!config) throw new Error('School configuration not found');

  const now = new Date();
  const { at, clockSkew } = resolveScanTime(now, input.scannedAt, input.sentAt);
  const credentialUid = normalizeCredential(input.credentialUid, config.dropLeadingZeros);
  const found = credentialUid ? await findStudentByCredentialUid(schoolId, credentialUid) : null;
  const student = found?.active ? found : null; // a withdrawn student's badge reads as unknown

  const outcome: ScanOutcome = {
    eventId: input.eventId ?? null,
    result: 'NOT_FOUND',
    studentName: student ? `${student.firstName} ${student.lastName}` : null,
    grade: student?.grade ?? null,
    group: student?.group ?? null,
    scannedAt: at.toISOString(),
    clockSkew,
  };

  if (student) outcome.result = await recordArrival(student, at, config, notifierService);

  if (!input.eventId) return outcome;
  try {
    await createScanEvent({ schoolId, eventId: input.eventId, credentialUid: input.credentialUid, scannedAt: at, clockSkew, result: { ...outcome } });
  } catch (err) {
    // The same event arrived twice at once: the first one's outcome wins.
    if (isUniqueViolation(err)) return (await findScanEvent(schoolId, input.eventId))!.result as unknown as ScanOutcome;
    throw err;
  }
  return outcome;
}

async function recordArrival(
  student: Student,
  at: Date,
  config: SchoolConfig,
  notifierService: NotifierService,
): Promise<ScanResultCode> {
  // The record belongs to the day of the scan, not the day of the upload.
  const day = getDateInTimezone(config.timezone, at);
  const existing = await findRecordByStudentAndDate(student.id, day);

  if (existing && (existing.status === AttendanceStatus.PRESENT || existing.status === AttendanceStatus.TARDY)) {
    return 'ALREADY_SCANNED';
  }

  const status = evaluateStatus(at, config.schoolStartTime, config.tardyGraceMinutes, config.absenceCutoffMinutes, config.timezone);
  if (status === 'OUTSIDE_WINDOW') return status;

  if (existing) {
    // Excused / marked absent, but a real arrival inside the window wins (a queued gate scan
    // can arrive after the absence run). Any excuse note is kept for the principal.
    await updateAttendanceRecord(existing.id, {
      status,
      scanTimestamp: at,
      updatedByRole: UpdatedByRole.SCANNER,
      updatedByUserId: null,
    });
  } else {
    try {
      await createAttendanceRecord({ studentId: student.id, date: day, scanTimestamp: at, status, updatedByRole: UpdatedByRole.SCANNER });
    } catch (err) {
      if (isUniqueViolation(err)) return 'ALREADY_SCANNED'; // two gates, same student, same instant
      throw err;
    }
  }

  // No correction messages: if the guardian already got the absence notice, stay silent.
  // Stale entries (an old offline queue) are not announced either.
  const absenceNoticeSent = existing?.status === AttendanceStatus.ABSENT && existing.updatedByRole === UpdatedByRole.SYSTEM;
  if (absenceNoticeSent || Date.now() - at.getTime() > ENTRY_MESSAGE_MAX_AGE_MS) return status;

  // Attendance is already saved: a notification failure must not fail the gate.
  // ponytail: failed messages are only logged; Phase 15 moves sending to an outbox with retries.
  try {
    await notifierService.sendScanAlert({
      guardianWhatsApp: student.guardianWhatsApp,
      guardianName: student.guardianName,
      studentName: `${student.firstName} ${student.lastName}`,
      status,
      timestamp: at,
    });
  } catch (err) {
    console.error(`[processScan] notification failed for student ${student.id}:`, err);
  }
  return status;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function evaluateAbsences(
  schoolId: string,
  notifierService: NotifierService = notifier,
): Promise<number> {
  const config = await getSchoolConfig(schoolId);
  if (!config) throw new Error('School configuration not found');

  const today = getDateInTimezone(config.timezone);
  // No classes (SEP holiday, CTE, vacation, the school's own day): nobody is absent, nobody is messaged.
  const dayOff = await nonSchoolDay(schoolId, today);
  if (dayOff) {
    console.log(`[AbsenceJob] ${schoolId}: no classes today (${dayOff}), skipped`);
    return 0;
  }
  const absentStudents = await findStudentsWithoutRecordForDate(schoolId, today);

  for (const student of absentStudents) {
    await createAttendanceRecord({
      studentId: student.id,
      date: today,
      status: AttendanceStatus.ABSENT,
      updatedByRole: UpdatedByRole.SYSTEM,
    });

    await notifierService.sendAbsenceAlert({
      guardianWhatsApp: student.guardianWhatsApp,
      guardianName: student.guardianName,
      studentName: `${student.firstName} ${student.lastName}`,
      date: today,
    });
  }

  console.log(`[AbsenceJob] ${schoolId}: marked ${absentStudents.length} student(s) as ABSENT`);
  return absentStudents.length;
}

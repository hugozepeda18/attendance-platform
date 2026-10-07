import { AttendanceStatus, UpdatedByRole } from '@prisma/client';
import { ScanResult } from '../types/attendance.types';
import { NotifierService, notifier } from './notifier';
import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import { findStudentByCredentialUid, findStudentsWithoutRecordForDate } from '../repositories/student.repository';
import {
  findRecordByStudentAndDate,
  createAttendanceRecord,
  updateAttendanceRecord,
} from '../repositories/attendance.repository';

export class StudentNotFoundError extends Error {
  constructor() {
    super('Student not found');
    this.name = 'StudentNotFoundError';
  }
}

export class AlreadyScannedError extends Error {
  constructor() {
    super('Attendance already recorded for today');
    this.name = 'AlreadyScannedError';
  }
}

// Scan after the safe-time window: the student is (or is about to be) ABSENT and the guardian
// notified. Nothing is saved; the gate sends the student to the office (decision C, 2026-10-07).
export class OutsideWindowError extends Error {
  constructor() {
    super('The attendance window is closed for today');
    this.name = 'OutsideWindowError';
  }
}

// start..start+grace → PRESENT; until start+absenceCutoff → TARDY; from the cutoff on → OUTSIDE_WINDOW
// (the absence run fires at exactly start+absenceCutoff).
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

export async function processScan(
  schoolId: string,
  credentialUid: string,
  notifierService: NotifierService = notifier,
): Promise<ScanResult> {
  const config = await getSchoolConfig(schoolId);
  if (!config) throw new Error('School configuration not found');

  const student = await findStudentByCredentialUid(schoolId, credentialUid);
  if (!student) throw new StudentNotFoundError();

  const today = getDateInTimezone(config.timezone);
  const existing = await findRecordByStudentAndDate(student.id, today);

  if (existing && (existing.status === AttendanceStatus.PRESENT || existing.status === AttendanceStatus.TARDY)) {
    throw new AlreadyScannedError();
  }

  const now = new Date();
  const status = evaluateStatus(
    now,
    config.schoolStartTime,
    config.tardyGraceMinutes,
    config.absenceCutoffMinutes,
    config.timezone,
  );
  if (status === 'OUTSIDE_WINDOW') throw new OutsideWindowError();

  if (existing) {
    // Excused (or manually marked absent) earlier today but arrived inside the window:
    // the real arrival wins. The excuse note is kept for the principal.
    await updateAttendanceRecord(existing.id, {
      status,
      scanTimestamp: now,
      updatedByRole: UpdatedByRole.SCANNER,
      updatedByUserId: null,
    });
  } else {
    await createAttendanceRecord({
      studentId: student.id,
      date: today,
      scanTimestamp: now,
      status,
      updatedByRole: UpdatedByRole.SCANNER,
    });
  }

  const studentName = `${student.firstName} ${student.lastName}`;

  // Attendance is already saved: a notification failure must not fail the gate (a retry would get 409).
  // ponytail: failed messages are only logged; Phase 15 moves sending to an outbox with retries.
  try {
    await notifierService.sendScanAlert({
      guardianWhatsApp: student.guardianWhatsApp,
      guardianName: student.guardianName,
      studentName,
      status,
      timestamp: now,
    });
  } catch (err) {
    console.error(`[processScan] notification failed for student ${student.id}:`, err);
  }

  return { studentName, status, timestamp: now };
}

export async function evaluateAbsences(
  schoolId: string,
  notifierService: NotifierService = notifier,
): Promise<number> {
  const config = await getSchoolConfig(schoolId);
  if (!config) throw new Error('School configuration not found');

  const today = getDateInTimezone(config.timezone);
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

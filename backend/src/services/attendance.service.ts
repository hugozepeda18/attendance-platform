import { AttendanceStatus, UpdatedByRole } from '@prisma/client';
import { ScanResult } from '../types/attendance.types';
import { NotifierService, notifier } from './notifier';
import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import { findStudentByCredentialUid, findStudentsWithoutRecordForDate } from '../repositories/student.repository';
import { findRecordByStudentAndDate, createAttendanceRecord } from '../repositories/attendance.repository';

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

export function evaluateStatus(
  scanTime: Date,
  schoolStartTime: string,
  tardyGraceMinutes: number,
  timezone: string,
): 'PRESENT' | 'TARDY' {
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
  const cutoffMinutes = startHour * 60 + startMinute + tardyGraceMinutes;

  return scanMinutes <= cutoffMinutes ? 'PRESENT' : 'TARDY';
}

export function getDateInTimezone(timezone: string, refDate?: Date): Date {
  const now = refDate ?? new Date();
  // en-CA locale produces YYYY-MM-DD, which Prisma serializes correctly as @db.Date
  const localDateStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  return new Date(localDateStr + 'T00:00:00.000Z');
}

export async function processScan(
  credentialUid: string,
  notifierService: NotifierService = notifier,
): Promise<ScanResult> {
  const config = await getSchoolConfig();
  if (!config) throw new Error('School configuration not found');

  const student = await findStudentByCredentialUid(credentialUid);
  if (!student) throw new StudentNotFoundError();

  const today = getDateInTimezone(config.timezone);
  const existing = await findRecordByStudentAndDate(student.id, today);

  if (existing && (existing.status === AttendanceStatus.PRESENT || existing.status === AttendanceStatus.TARDY)) {
    throw new AlreadyScannedError();
  }

  const now = new Date();
  const status = evaluateStatus(now, config.schoolStartTime, config.tardyGraceMinutes, config.timezone);

  await createAttendanceRecord({
    studentId: student.id,
    date: today,
    scanTimestamp: now,
    status,
    updatedByRole: UpdatedByRole.SCANNER,
  });

  const studentName = `${student.firstName} ${student.lastName}`;

  await notifierService.sendScanAlert({
    guardianWhatsApp: student.guardianWhatsApp,
    guardianName: student.guardianName,
    studentName,
    status,
    timestamp: now,
  });

  return { studentName, status, timestamp: now };
}

export async function evaluateAbsences(
  notifierService: NotifierService = notifier,
): Promise<number> {
  const config = await getSchoolConfig();
  if (!config) throw new Error('School configuration not found');

  const today = getDateInTimezone(config.timezone);
  const absentStudents = await findStudentsWithoutRecordForDate(today);

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

  console.log(`[AbsenceJob] Marked ${absentStudents.length} student(s) as ABSENT`);
  return absentStudents.length;
}

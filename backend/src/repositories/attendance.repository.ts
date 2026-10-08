import { AttendanceStatus, Prisma, UpdatedByRole } from '@prisma/client';
import prisma from '../lib/prisma';

export async function findRecordByStudentAndDate(studentId: string, date: Date) {
  return prisma.attendanceRecord.findUnique({
    where: { studentId_date: { studentId, date } },
  });
}

export async function findRecordById(schoolId: string, id: string) {
  return prisma.attendanceRecord.findFirst({ where: { id, student: { schoolId } } });
}

export async function createAttendanceRecord(data: {
  studentId: string;
  date: Date;
  scanTimestamp?: Date;
  status: AttendanceStatus;
  updatedByRole: UpdatedByRole;
  notifications?: Prisma.NotificationCreateNestedManyWithoutRecordInput;
}) {
  return prisma.attendanceRecord.create({ data });
}

export async function updateAttendanceRecord(
  id: string,
  data: {
    status: AttendanceStatus;
    note?: string | null;
    scanTimestamp?: Date;
    updatedByRole: UpdatedByRole;
    updatedByUserId?: string | null;
    notifications?: Prisma.NotificationUpdateManyWithoutRecordNestedInput;
  },
) {
  return prisma.attendanceRecord.update({ where: { id }, data });
}

export async function findRecordsByStudentIdsAndDate(studentIds: string[], date: Date) {
  return prisma.attendanceRecord.findMany({
    where: { studentId: { in: studentIds }, date },
  });
}

export async function findRecordsByStudentIdsAndDateRange(
  studentIds: string[],
  startDate: Date,
  endDate: Date,
) {
  return prisma.attendanceRecord.findMany({
    where: {
      studentId: { in: studentIds },
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: 'asc' },
  });
}

export async function findRecordsByStudentAndDateRange(
  studentId: string,
  startDate: Date,
  endDate: Date,
) {
  return prisma.attendanceRecord.findMany({
    where: {
      studentId,
      date: { gte: startDate, lte: endDate },
    },
    include: { updatedByUser: { select: { name: true } }, notifications: { select: { type: true, status: true } } },
    orderBy: { date: 'asc' },
  });
}

// Inserts EXCUSED records; days that already have a record are skipped (unique studentId+date).
export async function createExcusedRecords(
  rows: { studentId: string; date: Date; note: string; updatedByRole: UpdatedByRole; updatedByUserId: string | null }[],
) {
  return prisma.attendanceRecord.createMany({
    data: rows.map((r) => ({ ...r, status: AttendanceStatus.EXCUSED })),
    skipDuplicates: true,
  });
}

export async function findScanEvent(schoolId: string, eventId: string) {
  return prisma.scanEvent.findUnique({ where: { schoolId_eventId: { schoolId, eventId } } });
}

export async function createScanEvent(data: {
  schoolId: string;
  eventId: string;
  credentialUid: string;
  scannedAt: Date;
  clockSkew: boolean;
  result: Prisma.InputJsonValue;
}) {
  return prisma.scanEvent.create({ data });
}

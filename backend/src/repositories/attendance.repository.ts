import { AttendanceStatus, UpdatedByRole } from '@prisma/client';
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
}) {
  return prisma.attendanceRecord.create({ data });
}

export async function updateAttendanceRecord(
  id: string,
  data: { status: AttendanceStatus; note?: string | null; updatedByRole: UpdatedByRole },
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
    orderBy: { date: 'asc' },
  });
}

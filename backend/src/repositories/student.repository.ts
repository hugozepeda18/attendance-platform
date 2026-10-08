import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

// Withdrawn students (active = false) are left out of scans, the absence run, the gate and every list.
const active = { active: true };

// Case-insensitive: RFID readers may print hex UIDs in either case. Includes withdrawn students
// (their badge stays taken until reassigned); callers check `active`.
export async function findStudentByCredentialUid(schoolId: string, credentialUid: string) {
  return prisma.student.findFirst({ where: { schoolId, credentialUid: { equals: credentialUid, mode: 'insensitive' } } });
}

export async function findStudentById(schoolId: string, id: string) {
  return prisma.student.findFirst({ where: { id, schoolId } });
}

export async function findStudentsWithoutRecordForDate(schoolId: string, date: Date) {
  return prisma.student.findMany({
    where: {
      schoolId,
      ...active,
      attendanceRecords: {
        none: { date },
      },
    },
  });
}

export async function findStudentsByGradeAndGroup(schoolId: string, grade: number, group: string) {
  return prisma.student.findMany({
    where: { schoolId, grade, group, ...active },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export async function findStudentsByGrade(schoolId: string, grade: number) {
  return prisma.student.findMany({
    where: { schoolId, grade, ...active },
    orderBy: [{ group: 'asc' }, { lastName: 'asc' }],
  });
}

export async function findStudentsByName(schoolId: string, query: string) {
  return prisma.student.findMany({
    where: {
      schoolId,
      ...active,
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ grade: 'asc' }, { group: 'asc' }, { lastName: 'asc' }],
  });
}

// Badge → name list cached by the gate PC for instant offline feedback.
export async function listRosterForGate(schoolId: string) {
  return prisma.student.findMany({
    where: { schoolId, ...active },
    select: { credentialUid: true, firstName: true, lastName: true, grade: true, group: true },
  });
}

// Roster management (principal): withdrawn students included so they can be reactivated.
export async function listStudents(schoolId: string, grade?: number, group?: string) {
  return prisma.student.findMany({
    where: { schoolId, grade, group },
    orderBy: [{ grade: 'asc' }, { group: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export async function listGroups(schoolId: string) {
  return prisma.student.groupBy({
    by: ['grade', 'group'],
    where: { schoolId, ...active },
    _count: true,
    orderBy: [{ grade: 'asc' }, { group: 'asc' }],
  });
}

export async function createStudent(data: Prisma.StudentUncheckedCreateInput) {
  return prisma.student.create({ data });
}

export async function updateStudent(id: string, data: Prisma.StudentUpdateInput) {
  return prisma.student.update({ where: { id }, data });
}

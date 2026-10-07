import prisma from '../lib/prisma';

// Case-insensitive: RFID readers may print hex UIDs in either case.
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
      attendanceRecords: {
        none: { date },
      },
    },
  });
}

export async function findStudentsByGradeAndGroup(schoolId: string, grade: number, group: string) {
  return prisma.student.findMany({
    where: { schoolId, grade, group },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export async function findStudentsByGrade(schoolId: string, grade: number) {
  return prisma.student.findMany({
    where: { schoolId, grade },
    orderBy: [{ group: 'asc' }, { lastName: 'asc' }],
  });
}

export async function findStudentsByName(schoolId: string, query: string) {
  return prisma.student.findMany({
    where: {
      schoolId,
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
    where: { schoolId },
    select: { credentialUid: true, firstName: true, lastName: true, grade: true, group: true },
  });
}

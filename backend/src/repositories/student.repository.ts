import prisma from '../lib/prisma';

export async function findStudentByCredentialUid(schoolId: string, credentialUid: string) {
  return prisma.student.findUnique({ where: { schoolId_credentialUid: { schoolId, credentialUid } } });
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

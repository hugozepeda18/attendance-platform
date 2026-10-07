import prisma from '../lib/prisma';

export async function findStudentByCredentialUid(credentialUid: string) {
  return prisma.student.findUnique({ where: { credentialUid } });
}

export async function findStudentById(id: string) {
  return prisma.student.findUnique({ where: { id } });
}

export async function findStudentsWithoutRecordForDate(date: Date) {
  return prisma.student.findMany({
    where: {
      attendanceRecords: {
        none: { date },
      },
    },
  });
}

export async function findStudentsByGradeAndGroup(grade: number, group: string) {
  return prisma.student.findMany({
    where: { grade, group },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export async function findStudentsByGrade(grade: number) {
  return prisma.student.findMany({
    where: { grade },
    orderBy: [{ group: 'asc' }, { lastName: 'asc' }],
  });
}

export async function findStudentsByName(query: string) {
  return prisma.student.findMany({
    where: {
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ grade: 'asc' }, { group: 'asc' }, { lastName: 'asc' }],
  });
}

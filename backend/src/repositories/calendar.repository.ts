import prisma from '../lib/prisma';

export async function findSchoolDaysBetween(schoolId: string, from: Date, to: Date) {
  return prisma.schoolCalendarDay.findMany({ where: { schoolId, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } });
}

export async function createSchoolDay(data: { schoolId: string; date: Date; label: string }) {
  return prisma.schoolCalendarDay.create({ data });
}

export async function deleteSchoolDay(schoolId: string, id: string) {
  const { count } = await prisma.schoolCalendarDay.deleteMany({ where: { id, schoolId } });
  return count === 1;
}

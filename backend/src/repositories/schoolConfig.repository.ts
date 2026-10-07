import prisma from '../lib/prisma';

export async function getSchoolConfig(schoolId: string) {
  return prisma.schoolConfig.findUnique({ where: { schoolId } });
}

export async function markAbsenceRun(schoolId: string, date: Date) {
  return prisma.schoolConfig.update({ where: { schoolId }, data: { absenceRunOn: date } });
}

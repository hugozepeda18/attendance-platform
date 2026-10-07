import prisma from '../lib/prisma';

export async function getSchoolConfig(schoolId: string) {
  return prisma.schoolConfig.findUnique({ where: { schoolId } });
}

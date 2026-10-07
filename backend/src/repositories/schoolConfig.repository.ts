import prisma from '../lib/prisma';

export async function getSchoolConfig() {
  return prisma.schoolConfig.findFirst();
}

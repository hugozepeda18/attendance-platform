// Dev API keys created by prisma/seed.ts. "north" = default-school, "south" = school-b.
export const NORTH = 'default-school';
export const SOUTH = 'school-b';

export const KEYS = {
  northScanner: 'ak_dev_north_scanner',
  northStaff: 'ak_dev_north_staff',
  northPrincipal: 'ak_dev_north_principal',
  southScanner: 'ak_dev_south_scanner',
  southStaff: 'ak_dev_south_staff',
  southPrincipal: 'ak_dev_south_principal',
  superadmin: 'ak_dev_superadmin',
};

export const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

// WhatsApp messages waiting in the outbox (what the worker sends), oldest first. Records are deleted
// with their messages (cascade), so wiping attendance records also empties this.
export const outbox = (prisma: import('@prisma/client').PrismaClient, type?: 'ENTRY' | 'ABSENCE' | 'PRINCIPAL_ALERT') =>
  prisma.notification.findMany({ where: { type }, orderBy: { createdAt: 'asc' } });

export const DEV_PASSWORD = 'dev-password-123';
export const OWNER_EMAIL = 'owner@platform.test';

// Removes every school (and its dependents) not created by the seed.
export async function cleanupCreatedSchools(prisma: import('@prisma/client').PrismaClient) {
  const where = { schoolId: { notIn: [NORTH, SOUTH] } };
  await prisma.changeRequest.deleteMany({ where });
  await prisma.notification.deleteMany({ where });
  await prisma.schoolCalendarDay.deleteMany({ where });
  await prisma.session.deleteMany({ where: { user: where } });
  await prisma.session.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.apiKey.deleteMany({ where });
  await prisma.schoolConfig.deleteMany({ where });
  await prisma.school.deleteMany({ where: { id: { notIn: [NORTH, SOUTH] } } });
}

// Moves the faked clock (see setup.ts) to a local time in Mexico City on Tuesday 2026-10-06.
export function setMexicoCityTime(hhmm: string): void {
  const [h, m] = hhmm.split(':').map(Number);
  jest.setSystemTime(new Date(Date.UTC(2026, 9, 6, h + 6, m)));
}

export async function signIn(school: string, email: string): Promise<string> {
  const res = await (await import('supertest')).default((await import('../src/index')).default)
    .post('/api/v1/auth/login')
    .send({ school, email, password: DEV_PASSWORD });
  return res.body.token;
}

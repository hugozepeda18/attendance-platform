import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { runAbsenceTick } from '../../src/jobs/absence.job';
import { auth, cleanupCreatedSchools, DEV_PASSWORD, NORTH, OWNER_EMAIL } from '../helpers';

let owner: string;

const adminLogin = (email: string, password = DEV_PASSWORD) =>
  request(app).post('/api/v1/auth/admin-login').send({ email, password });

beforeAll(async () => {
  await cleanupCreatedSchools(prisma);
  owner = (await adminLogin(OWNER_EMAIL)).body.token;
});

afterAll(async () => {
  await cleanupCreatedSchools(prisma);
  await prisma.platformAdmin.update({ where: { email: OWNER_EMAIL }, data: { active: true } });
  await prisma.$disconnect();
});

describe('Platform owner sign-in', () => {
  it('signs in and gets SUPERADMIN access to the admin API and, with x-school-id, a school', async () => {
    expect(owner).toMatch(/^st_/);
    const me = await request(app).get('/api/v1/me').set(auth(owner));
    expect(me.body).toMatchObject({ role: 'SUPERADMIN', school: null, user: { email: OWNER_EMAIL } });

    expect((await request(app).get('/api/v1/admin/schools').set(auth(owner))).status).toBe(200);
    const search = await request(app).get('/api/v1/attendance/search?query=1-A').set(auth(owner)).set('x-school-id', NORTH);
    expect(search.status).toBe(200);
  });

  it('rejects wrong passwords and school-user credentials', async () => {
    expect((await adminLogin(OWNER_EMAIL, 'wrong-password')).status).toBe(401);
    expect((await adminLogin('principal@norte.test')).status).toBe(401);
  });

  it('owner credentials do not work on a school login page', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ school: 'norte', email: OWNER_EMAIL, password: DEV_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('school user sessions cannot reach the admin API (403)', async () => {
    const { token } = (await request(app).post('/api/v1/auth/login').send({ school: 'norte', email: 'principal@norte.test', password: DEV_PASSWORD })).body;
    expect((await request(app).get('/api/v1/admin/schools').set(auth(token))).status).toBe(403);
  });

  it('logout and deactivation end owner sessions', async () => {
    const a = (await adminLogin(OWNER_EMAIL)).body.token;
    await request(app).post('/api/v1/auth/logout').set(auth(a)).expect(204);
    expect((await request(app).get('/api/v1/me').set(auth(a))).status).toBe(401);

    const b = (await adminLogin(OWNER_EMAIL)).body.token;
    await prisma.platformAdmin.update({ where: { email: OWNER_EMAIL }, data: { active: false } });
    expect((await request(app).get('/api/v1/me').set(auth(b))).status).toBe(401);
    expect((await adminLogin(OWNER_EMAIL)).status).toBe(401);
    await prisma.platformAdmin.update({ where: { email: OWNER_EMAIL }, data: { active: true } });
  });
});

describe('Create school with its first principal', () => {
  const principal = { email: 'director@nueva.test', name: 'Directora', password: 'first-principal-pw' };

  it('creates both; the principal can sign in at the school address', async () => {
    const res = await request(app).post('/api/v1/admin/schools').set(auth(owner)).send({ name: 'Nueva', slug: 'test-nueva', principal });
    expect(res.status).toBe(201);
    const login = await request(app).post('/api/v1/auth/login').send({ school: 'test-nueva', email: principal.email, password: principal.password });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('PRINCIPAL');
  });

  it('saves nothing when the principal is invalid (400)', async () => {
    const before = await prisma.school.count();
    const res = await request(app).post('/api/v1/admin/schools').set(auth(owner))
      .send({ name: 'Bad', slug: 'test-bad', principal: { ...principal, email: 'not-an-email' } });
    expect(res.status).toBe(400);
    expect(await prisma.school.count()).toBe(before);
  });

  it('saves nothing when the slug is taken (409), including the principal', async () => {
    const res = await request(app).post('/api/v1/admin/schools').set(auth(owner))
      .send({ name: 'Dup', slug: 'norte', principal: { ...principal, email: 'ghost@x.test' } });
    expect(res.status).toBe(409);
    expect(await prisma.user.count({ where: { email: 'ghost@x.test' } })).toBe(0);
  });
});

describe('School detail and settings', () => {
  it('returns detail with counts', async () => {
    const res = await request(app).get(`/api/v1/admin/schools/${NORTH}`).set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: 'norte', studentCount: 30, config: { timezone: 'America/Mexico_City' } });
    expect(res.body.userCount).toBeGreaterThanOrEqual(2);
    expect(res.body.activeKeyCount).toBeGreaterThanOrEqual(3);
    await request(app).get('/api/v1/admin/schools/nope').set(auth(owner)).expect(404);
  });

  it('edits name and schedule; validates values', async () => {
    const { id } = (await request(app).post('/api/v1/admin/schools').set(auth(owner)).send({ name: 'Cfg', slug: 'test-cfg' })).body.school;
    const res = await request(app).patch(`/api/v1/admin/schools/${id}`).set(auth(owner))
      .send({ name: 'Cfg 2', schoolStartTime: '07:15', absenceCutoffMinutes: 20, timezone: 'America/Cancun' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Cfg 2', config: { schoolStartTime: '07:15', absenceCutoffMinutes: 20, timezone: 'America/Cancun' } });

    await request(app).patch(`/api/v1/admin/schools/${id}`).set(auth(owner)).send({ timezone: 'Mars/Base' }).expect(400);
    await request(app).patch(`/api/v1/admin/schools/${id}`).set(auth(owner)).send({ schoolStartTime: '7:15' }).expect(400);
    await request(app).patch(`/api/v1/admin/schools/${id}`).set(auth(owner)).send({}).expect(400);
  });
});

describe('Absence job picks up changes without a restart', () => {
  // Tuesday 2026-10-06. New school: 06:00 + 30 → due at 06:30 local.
  const at = (utc: string) => new Date(`2026-10-06T${utc}:00Z`);

  it('new school, timezone change and deactivation take effect on the next tick', async () => {
    const { id } = (await request(app).post('/api/v1/admin/schools').set(auth(owner))
      .send({ name: 'Job', slug: 'test-job', schoolStartTime: '06:00', absenceCutoffMinutes: 30, timezone: 'America/Mexico_City' })).body.school;
    const noop = async () => undefined;

    // Created after "boot": due at 06:30 Mexico City (12:30Z)
    expect(await runAbsenceTick(at('12:30'), noop)).toEqual([id]);
    expect(await runAbsenceTick(at('12:31'), noop)).toEqual([]);

    // Moved to Tijuana (UTC-7): now due at 13:30Z instead (the run above already counts for today)
    const notRunToday = () => prisma.schoolConfig.update({ where: { schoolId: id }, data: { absenceRunOn: null } });
    await notRunToday();
    await request(app).patch(`/api/v1/admin/schools/${id}`).set(auth(owner)).send({ timezone: 'America/Tijuana' }).expect(200);
    expect(await runAbsenceTick(at('12:30'), noop)).toEqual([]);
    expect(await runAbsenceTick(at('13:30'), noop)).toEqual([id]);

    // Deactivated: skipped
    await notRunToday();
    await request(app).patch(`/api/v1/admin/schools/${id}`).set(auth(owner)).send({ active: false }).expect(200);
    expect(await runAbsenceTick(at('13:30'), noop)).toEqual([]);
  });

  it('runs the real evaluation for the due school only', async () => {
    await cleanupCreatedSchools(prisma); // schools created above with default 08:00 schedules would also be due
    await prisma.attendanceRecord.deleteMany({}); // other suites may leave today's scans behind
    await prisma.schoolConfig.updateMany({ data: { absenceRunOn: null } });
    await prisma.apiKey.updateMany({ data: { lastSeenAt: null, pendingScans: 0 } }); // no gates to wait for
    const due = await runAbsenceTick(at('14:30')); // 08:30 Mexico City → seeded "norte"
    expect(due).toEqual([NORTH]);
    expect(await prisma.attendanceRecord.count({ where: { status: 'ABSENT', student: { schoolId: NORTH } } })).toBe(30);
    expect(await prisma.attendanceRecord.count({ where: { student: { schoolId: { not: NORTH } } } })).toBe(0);
    await prisma.attendanceRecord.deleteMany({});
  });
});

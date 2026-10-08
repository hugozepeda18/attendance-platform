import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { auth, DEV_PASSWORD, KEYS, NORTH, OWNER_EMAIL, SOUTH, signIn } from '../helpers';

// "Open as support": the platform owner works inside one school with principal powers.
let owner: string;
let support: string;

const open = (schoolId: string, token = owner) => request(app).post(`/api/v1/admin/schools/${schoolId}/support`).set(auth(token));

beforeAll(async () => {
  owner = (await request(app).post('/api/v1/auth/admin-login').send({ email: OWNER_EMAIL, password: DEV_PASSWORD })).body.token;
  support = (await open(NORTH)).body.token;
});

afterAll(async () => {
  await prisma.changeRequest.deleteMany({});
  await prisma.attendanceRecord.deleteMany({});
  await prisma.session.deleteMany({ where: { schoolId: { not: null } } });
  await prisma.$disconnect();
});

describe('Support sessions', () => {
  it('opens the school as the owner: its data, the principal tabs, changes marked SUPERADMIN', async () => {
    const me = await request(app).get('/api/v1/me').set(auth(support));
    expect(me.body).toMatchObject({ role: 'SUPERADMIN', school: { id: NORTH }, user: { email: OWNER_EMAIL } });
    expect((await request(app).get('/api/v1/students/groups').set(auth(support))).status).toBe(200);
    expect((await request(app).get('/api/v1/users').set(auth(support))).status).toBe(200);

    const student = await prisma.student.findFirstOrThrow({ where: { schoolId: NORTH } });
    const res = await request(app).post('/api/v1/attendance/changes').set(auth(support))
      .send({ studentId: student.id, date: '2026-10-05', status: 'EXCUSED', reason: 'Fixed by support' });
    expect(res.status).toBe(200);
    const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId: student.id } });
    expect(record.updatedByRole).toBe('SUPERADMIN');
  });

  it('stays inside its school and has no platform admin rights', async () => {
    const south = await request(app).get('/api/v1/students/groups').set(auth(support)).set('x-school-id', SOUTH);
    const southStudent = await prisma.student.findFirstOrThrow({ where: { schoolId: SOUTH } });
    expect(south.body.groups.length).toBeGreaterThan(0);
    expect((await request(app).get(`/api/v1/attendance/analytics/student/${southStudent.id}`).set(auth(support)).set('x-school-id', SOUTH)).status).toBe(404);
    expect((await request(app).get('/api/v1/admin/schools').set(auth(support))).status).toBe(403);
    expect((await open(SOUTH, support)).status).toBe(403);
  });

  it('only a signed-in owner can open one; unknown school 404; exit revokes it', async () => {
    expect((await open(NORTH, KEYS.superadmin)).body.error).toBe('ADMIN_SESSION_REQUIRED');
    expect((await open(NORTH, await signIn('norte', 'principal@norte.test'))).status).toBe(403);
    expect((await open('no-such-school')).status).toBe(404);

    const temp = (await open(NORTH)).body.token;
    expect((await request(app).post('/api/v1/auth/logout').set(auth(temp))).status).toBe(204);
    expect((await request(app).get('/api/v1/me').set(auth(temp))).status).toBe(401);
  });

  it('tells the new-school wizard whether an address is free', async () => {
    const check = (slug: string) => request(app).get('/api/v1/admin/slug-available').query({ slug }).set(auth(owner));
    expect((await check('norte')).body).toEqual({ available: false, reason: 'Another school already uses this address' });
    expect((await check('nueva-secundaria')).body).toEqual({ available: true });
    expect((await check('admin')).body.available).toBe(false);
    expect((await check('Mal Nombre')).body.available).toBe(false);
  });
});

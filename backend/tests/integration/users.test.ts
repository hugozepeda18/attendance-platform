import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { auth, KEYS, NORTH, SOUTH } from '../helpers';

const PASSWORD = 'dev-password-123';
let principal: string;
let principalId: string;

async function signIn(school: string, email: string, password = PASSWORD) {
  const res = await request(app).post('/api/v1/auth/login').send({ school, email, password });
  return res.body as { token: string; user: { id: string } };
}

async function cleanup() {
  const where = { email: { startsWith: 'new-' } };
  await prisma.attendanceRecord.updateMany({ where: { updatedByUser: where }, data: { updatedByUserId: null } });
  await prisma.session.deleteMany({ where: { user: where } });
  await prisma.user.deleteMany({ where });
}

beforeAll(async () => {
  await cleanup();
  ({ token: principal, user: { id: principalId } } = await signIn('norte', 'principal@norte.test'));
});

afterAll(async () => {
  await prisma.attendanceRecord.deleteMany({});
  await cleanup();
  await prisma.$disconnect();
});

const newUser = { email: 'new-staff@norte.test', name: 'Nuevo Prefecto', role: 'STAFF', password: 'a-strong-password' };

describe('Principal manages staff accounts', () => {
  it('creates a staff user who can then sign in', async () => {
    const res = await request(app).post('/api/v1/users').set(auth(principal)).send(newUser);
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect((await signIn('norte', newUser.email, newUser.password)).token).toMatch(/^st_/);
  });

  it('rejects a duplicate email (409), weak password and SCANNER role (400)', async () => {
    expect((await request(app).post('/api/v1/users').set(auth(principal)).send(newUser)).status).toBe(409);
    expect((await request(app).post('/api/v1/users').set(auth(principal)).send({ ...newUser, email: 'new-2@x.test', password: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/v1/users').set(auth(principal)).send({ ...newUser, email: 'new-3@x.test', role: 'SCANNER' })).status).toBe(400);
  });

  it('lists only its own school\'s users, without password hashes', async () => {
    const res = await request(app).get('/api/v1/users').set(auth(principal));
    expect(res.status).toBe(200);
    const emails = res.body.users.map((u: { email: string }) => u.email);
    expect(emails).toContain('principal@norte.test');
    expect(emails).not.toContain('principal@sur.test');
    expect(JSON.stringify(res.body)).not.toContain('scrypt');
  });

  it('deactivating a user ends their sessions immediately', async () => {
    const { token, user } = await signIn('norte', newUser.email, newUser.password);
    await request(app).patch(`/api/v1/users/${user.id}`).set(auth(principal)).send({ active: false }).expect(200);
    expect((await request(app).get('/api/v1/me').set(auth(token))).status).toBe(401);
    expect((await signIn('norte', newUser.email, newUser.password)).token).toBeUndefined();
    await request(app).patch(`/api/v1/users/${user.id}`).set(auth(principal)).send({ active: true }).expect(200);
  });

  it('a password reset ends sessions and the new password works', async () => {
    const { token, user } = await signIn('norte', newUser.email, newUser.password);
    await request(app).patch(`/api/v1/users/${user.id}`).set(auth(principal)).send({ password: 'another-password' }).expect(200);
    expect((await request(app).get('/api/v1/me').set(auth(token))).status).toBe(401);
    expect((await signIn('norte', newUser.email, 'another-password')).token).toMatch(/^st_/);
  });

  it('a principal cannot lock themselves out (400)', async () => {
    const res = await request(app).patch(`/api/v1/users/${principalId}`).set(auth(principal)).send({ active: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SELF_LOCKOUT');
    await request(app).patch(`/api/v1/users/${principalId}`).set(auth(principal)).send({ role: 'STAFF' }).expect(400);
  });

  it('cannot touch another school\'s users (404)', async () => {
    const southUser = await prisma.user.findUniqueOrThrow({ where: { schoolId_email: { schoolId: SOUTH, email: 'staff@sur.test' } } });
    const res = await request(app).patch(`/api/v1/users/${southUser.id}`).set(auth(principal)).send({ active: false });
    expect(res.status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: southUser.id } })).active).toBe(true);
  });

  it('STAFF cannot manage users (403)', async () => {
    const { token } = await signIn('norte', 'staff@norte.test');
    expect((await request(app).get('/api/v1/users').set(auth(token))).status).toBe(403);
    expect((await request(app).post('/api/v1/users').set(auth(token)).send({ ...newUser, email: 'new-x@x.test' })).status).toBe(403);
  });

  it('super-admin creates a school\'s first principal via x-school-id', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(KEYS.superadmin))
      .set('x-school-id', SOUTH)
      .send({ email: 'new-director@sur.test', name: 'Directora', role: 'PRINCIPAL', password: 'first-principal-pw' });
    expect(res.status).toBe(201);
    expect((await signIn('sur', 'new-director@sur.test', 'first-principal-pw')).token).toMatch(/^st_/);
  });
});

describe('Overrides record the acting person', () => {
  it('stores updatedByUserId for a signed-in principal', async () => {
    const student = await prisma.student.findUniqueOrThrow({ where: { schoolId_credentialUid: { schoolId: NORTH, credentialUid: 'CARD-1A-01' } } });
    const record = await prisma.attendanceRecord.create({
      data: { studentId: student.id, date: new Date('2026-02-02'), status: 'ABSENT', updatedByRole: 'SYSTEM' },
    });
    const res = await request(app)
      .patch(`/api/v1/attendance/record/${record.id}`)
      .set(auth(principal))
      .send({ status: 'EXCUSED', note: 'Receta médica' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ updatedByRole: 'PRINCIPAL', updatedByUserId: principalId });
  });
});

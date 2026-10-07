import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { hashPassword } from '../../src/lib/tokens';
import { auth, NORTH, SOUTH } from '../helpers';

const PASSWORD = 'dev-password-123';
const login = (school: string, email: string, password = PASSWORD) =>
  request(app).post('/api/v1/auth/login').send({ school, email, password });

afterAll(async () => {
  await prisma.school.update({ where: { id: SOUTH }, data: { active: true } });
  await prisma.user.updateMany({ where: { email: { endsWith: '.test' } }, data: { active: true } });
  await prisma.session.deleteMany({ where: { user: { email: { startsWith: 'throttle' } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'throttle' } } });
  await prisma.$disconnect();
});

describe('Public school lookup (sign-in page)', () => {
  it('returns the name for a known slug', async () => {
    const res = await request(app).get('/api/v1/public/schools/norte');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Secundaria Demo Norte' });
  });

  it('404s for unknown or inactive schools', async () => {
    await request(app).get('/api/v1/public/schools/nope').expect(404);
    await prisma.school.update({ where: { id: SOUTH }, data: { active: false } });
    await request(app).get('/api/v1/public/schools/sur').expect(404);
    await prisma.school.update({ where: { id: SOUTH }, data: { active: true } });
  });
});

describe('POST /api/v1/auth/login', () => {
  it('signs in and the session works for tenant routes', async () => {
    const res = await login('norte', 'principal@norte.test');
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^st_/);
    expect(res.body.user).toMatchObject({ email: 'principal@norte.test', role: 'PRINCIPAL' });
    expect(res.body.school.id).toBe(NORTH);

    const me = await request(app).get('/api/v1/me').set(auth(res.body.token));
    expect(me.body).toMatchObject({ role: 'PRINCIPAL', school: { slug: 'norte' }, user: { email: 'principal@norte.test' } });

    const search = await request(app).get('/api/v1/attendance/search?query=1-A').set(auth(res.body.token));
    expect(search.status).toBe(200);
  });

  it('accepts the email case-insensitively', async () => {
    expect((await login('norte', 'Principal@Norte.TEST')).status).toBe(200);
  });

  it('only stores a hash of the session token', async () => {
    const res = await login('norte', 'staff@norte.test');
    expect(await prisma.session.count({ where: { tokenHash: res.body.token } })).toBe(0);
  });

  it('rejects a wrong password and unknown email with the same 401', async () => {
    const wrong = await login('norte', 'staff@norte.test', 'not-the-password');
    const unknown = await login('norte', 'nobody@norte.test');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('a user cannot sign in through another school\'s URL', async () => {
    expect((await login('sur', 'principal@norte.test')).status).toBe(401);
  });

  it('rejects deactivated users', async () => {
    await prisma.user.update({ where: { schoolId_email: { schoolId: SOUTH, email: 'staff@sur.test' } }, data: { active: false } });
    expect((await login('sur', 'staff@sur.test')).status).toBe(401);
    await prisma.user.update({ where: { schoolId_email: { schoolId: SOUTH, email: 'staff@sur.test' } }, data: { active: true } });
  });

  it('rejects users of a deactivated school (403)', async () => {
    await prisma.school.update({ where: { id: SOUTH }, data: { active: false } });
    expect((await login('sur', 'staff@sur.test')).status).toBe(403);
    await prisma.school.update({ where: { id: SOUTH }, data: { active: true } });
  });

  it('throttles after 5 failed attempts (429), even with the right password', async () => {
    await prisma.user.create({
      data: { schoolId: NORTH, email: 'throttle@norte.test', name: 'T', role: 'STAFF', passwordHash: await hashPassword(PASSWORD) },
    });
    for (let i = 0; i < 5; i++) expect((await login('norte', 'throttle@norte.test', 'wrong-password')).status).toBe(401);
    expect((await login('norte', 'throttle@norte.test')).status).toBe(429);
  });

  it('validates input', async () => {
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'x' })).status).toBe(400);
  });
});

describe('Sessions', () => {
  it('logout revokes the session', async () => {
    const { token } = (await login('norte', 'staff@norte.test')).body;
    await request(app).post('/api/v1/auth/logout').set(auth(token)).expect(204);
    expect((await request(app).get('/api/v1/me').set(auth(token))).status).toBe(401);
  });

  it('expired sessions are rejected', async () => {
    const { token } = (await login('norte', 'staff@norte.test')).body;
    await prisma.session.updateMany({ where: { revokedAt: null, user: { email: 'staff@norte.test' } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get('/api/v1/me').set(auth(token))).status).toBe(401);
  });

  it('sessions of a deactivated school are blocked (403)', async () => {
    const { token } = (await login('sur', 'staff@sur.test')).body;
    await prisma.school.update({ where: { id: SOUTH }, data: { active: false } });
    expect((await request(app).get('/api/v1/me').set(auth(token))).status).toBe(403);
    await prisma.school.update({ where: { id: SOUTH }, data: { active: true } });
  });

  it('STAFF sessions cannot override records (403)', async () => {
    const { token } = (await login('norte', 'staff@norte.test')).body;
    const res = await request(app).patch('/api/v1/attendance/record/x').set(auth(token)).send({ status: 'EXCUSED' });
    expect(res.status).toBe(403);
  });
});

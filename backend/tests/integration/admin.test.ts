import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { auth, KEYS, NORTH } from '../helpers';

const SEEDED = ['default-school', 'school-b'];

async function cleanupCreatedSchools() {
  const where = { schoolId: { notIn: SEEDED } };
  await prisma.apiKey.deleteMany({ where });
  await prisma.schoolConfig.deleteMany({ where });
  await prisma.school.deleteMany({ where: { id: { notIn: SEEDED } } });
}

afterAll(async () => {
  await cleanupCreatedSchools();
  await prisma.$disconnect();
});

const admin = auth(KEYS.superadmin);

describe('Admin API guard', () => {
  it('rejects a school PRINCIPAL key (403)', async () => {
    const res = await request(app).get('/api/v1/admin/schools').set(auth(KEYS.northPrincipal));
    expect(res.status).toBe(403);
  });

  it('rejects no token (401)', async () => {
    const res = await request(app).get('/api/v1/admin/schools');
    expect(res.status).toBe(401);
  });
});

describe('School onboarding lifecycle', () => {
  it('creates a school with config and three one-time keys that work immediately', async () => {
    const res = await request(app)
      .post('/api/v1/admin/schools')
      .set(admin)
      .send({ name: 'Secundaria Nueva', timezone: 'America/Monterrey', schoolStartTime: '07:30' });

    expect(res.status).toBe(201);
    expect(res.body.school.config).toMatchObject({ timezone: 'America/Monterrey', schoolStartTime: '07:30' });
    expect(res.body.apiKeys.map((k: { role: string }) => k.role).sort()).toEqual(['PRINCIPAL', 'SCANNER', 'STAFF']);

    // Only hashes are stored
    const stored = await prisma.apiKey.findMany({ where: { schoolId: res.body.school.id } });
    stored.forEach((k) => expect(res.body.apiKeys.map((a: { key: string }) => a.key)).not.toContain(k.keyHash));

    const principalKey = res.body.apiKeys.find((k: { role: string }) => k.role === 'PRINCIPAL').key;
    const me = await request(app).get('/api/v1/me').set(auth(principalKey));
    expect(me.body).toMatchObject({ role: 'PRINCIPAL', school: { name: 'Secundaria Nueva' } });

    // New school sees no students (none from other tenants)
    const search = await request(app).get('/api/v1/attendance/search?query=1').set(auth(principalKey));
    expect(search.body.results).toHaveLength(0);
  });

  it('validates input (bad timezone, bad time)', async () => {
    const tz = await request(app).post('/api/v1/admin/schools').set(admin).send({ name: 'X', timezone: 'Mars/Base' });
    expect(tz.status).toBe(400);
    const time = await request(app).post('/api/v1/admin/schools').set(admin).send({ name: 'X', schoolStartTime: '25:00' });
    expect(time.status).toBe(400);
  });

  it('lists schools with student counts', async () => {
    const res = await request(app).get('/api/v1/admin/schools').set(admin);
    expect(res.status).toBe(200);
    expect(res.body.schools.find((s: { id: string }) => s.id === NORTH).studentCount).toBe(30);
  });

  it('deactivates and reactivates a school', async () => {
    const created = await request(app).post('/api/v1/admin/schools').set(admin).send({ name: 'Temp' });
    const id = created.body.school.id;
    const staffKey = created.body.apiKeys.find((k: { role: string }) => k.role === 'STAFF').key;

    await request(app).patch(`/api/v1/admin/schools/${id}`).set(admin).send({ active: false }).expect(200);
    expect((await request(app).get('/api/v1/me').set(auth(staffKey))).status).toBe(403);

    await request(app).patch(`/api/v1/admin/schools/${id}`).set(admin).send({ active: true }).expect(200);
    expect((await request(app).get('/api/v1/me').set(auth(staffKey))).status).toBe(200);
  });

  it('issues, lists and revokes keys', async () => {
    const created = await request(app).post('/api/v1/admin/schools').set(admin).send({ name: 'Keys' });
    const id = created.body.school.id;

    const issued = await request(app)
      .post(`/api/v1/admin/schools/${id}/keys`)
      .set(admin)
      .send({ role: 'SCANNER', label: 'Gate 2' });
    expect(issued.status).toBe(201);
    expect((await request(app).get('/api/v1/me').set(auth(issued.body.key))).status).toBe(200);

    const list = await request(app).get(`/api/v1/admin/schools/${id}/keys`).set(admin);
    expect(list.body.keys).toHaveLength(4);
    expect(JSON.stringify(list.body)).not.toContain('keyHash');

    await request(app).delete(`/api/v1/admin/schools/${id}/keys/${issued.body.id}`).set(admin).expect(204);
    expect((await request(app).get('/api/v1/me').set(auth(issued.body.key))).status).toBe(401);

    // Cannot revoke a key through the wrong school id
    const other = list.body.keys[0].id;
    await request(app).delete(`/api/v1/admin/schools/${NORTH}/keys/${other}`).set(admin).expect(404);
  });

  it('returns 404 for unknown schools', async () => {
    await request(app).patch('/api/v1/admin/schools/nope').set(admin).send({ active: false }).expect(404);
    await request(app).post('/api/v1/admin/schools/nope/keys').set(admin).send({ role: 'STAFF', label: 'x' }).expect(404);
  });
});

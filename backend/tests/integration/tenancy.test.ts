import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { evaluateAbsences } from '../../src/services/attendance.service';
import { hashToken } from '../../src/lib/tokens';
import { auth, KEYS, NORTH, SOUTH } from '../helpers';


afterAll(async () => {
  await prisma.school.update({ where: { id: SOUTH }, data: { active: true } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
});

async function studentOf(schoolId: string, credentialUid = 'CARD-1A-01') {
  return prisma.student.findUniqueOrThrow({ where: { schoolId_credentialUid: { schoolId, credentialUid } } });
}

describe('Authentication', () => {
  it('rejects requests with no token (401)', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=1');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown token (401)', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=1').set(auth('ak_nope'));
    expect(res.status).toBe(401);
  });

  it('rejects a revoked key (401)', async () => {
    const key = await prisma.apiKey.create({
      data: { schoolId: NORTH, role: 'STAFF', label: 'revoked', keyHash: hashToken('ak_revoked_test'), revokedAt: new Date() },
    });

    const res = await request(app).get('/api/v1/attendance/search?query=1').set(auth('ak_revoked_test'));
    expect(res.status).toBe(401);
    await prisma.apiKey.delete({ where: { id: key.id } });
  });

  it('blocks keys of a deactivated school (403)', async () => {
    await prisma.school.update({ where: { id: SOUTH }, data: { active: false } });
    const res = await request(app).get('/api/v1/attendance/search?query=1').set(auth(KEYS.southStaff));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SCHOOL_INACTIVE');
    await prisma.school.update({ where: { id: SOUTH }, data: { active: true } });
  });

  it('SCANNER keys can scan but cannot read student data (403)', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=1').set(auth(KEYS.northScanner));
    expect(res.status).toBe(403);
  });

  it('GET /me returns role and school', async () => {
    const res = await request(app).get('/api/v1/me').set(auth(KEYS.northPrincipal));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'PRINCIPAL', school: { id: NORTH } });
  });
});

describe('Tenant isolation (both schools share badge IDs)', () => {
  it('a scan only creates a record in the scanning school', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/scan')
      .set(auth(KEYS.northScanner))
      .send({ credentialUid: 'CARD-1A-01' });
    expect(res.status).toBe(201);

    const north = await studentOf(NORTH);
    const south = await studentOf(SOUTH);
    expect(await prisma.attendanceRecord.count({ where: { studentId: north.id } })).toBe(1);
    expect(await prisma.attendanceRecord.count({ where: { studentId: south.id } })).toBe(0);

    // Same badge in the other school is still free to scan (no cross-tenant 409)
    const other = await request(app)
      .post('/api/v1/attendance/scan')
      .set(auth(KEYS.southStaff))
      .send({ credentialUid: 'CARD-1A-01' });
    expect(other.status).toBe(201);
  });

  it('search never returns another school\'s students', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=1').set(auth(KEYS.northStaff));
    const southIds = new Set(
      (await prisma.student.findMany({ where: { schoolId: SOUTH }, select: { id: true } })).map((s) => s.id),
    );
    expect(res.body.results).toHaveLength(10);
    res.body.results.forEach((s: { id: string }) => expect(southIds.has(s.id)).toBe(false));
  });

  it('student analytics for another school\'s student returns 404', async () => {
    const south = await studentOf(SOUTH);
    const res = await request(app)
      .get(`/api/v1/attendance/analytics/student/${south.id}`)
      .set(auth(KEYS.northStaff));
    expect(res.status).toBe(404);
  });

  it('group analytics only counts the caller\'s school', async () => {
    const res = await request(app).get('/api/v1/attendance/analytics/group/1/A').set(auth(KEYS.northStaff));
    expect(res.body.today.total).toBe(5);
  });

  it('a principal cannot override another school\'s record (404, unchanged)', async () => {
    const south = await studentOf(SOUTH);
    const record = await prisma.attendanceRecord.create({
      data: { studentId: south.id, date: new Date('2026-01-05'), status: 'ABSENT', updatedByRole: 'SYSTEM' },
    });

    const res = await request(app)
      .patch(`/api/v1/attendance/record/${record.id}`)
      .set(auth(KEYS.northPrincipal))
      .send({ status: 'EXCUSED' });
    expect(res.status).toBe(404);
    expect((await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } })).status).toBe('ABSENT');
  });

  it('the absence job for one school does not touch the other', async () => {
    const marked = await evaluateAbsences(NORTH);
    expect(marked).toBe(30);
    expect(await prisma.attendanceRecord.count({ where: { student: { schoolId: SOUTH } } })).toBe(0);
  });
});

describe('Super-admin access to tenant routes', () => {
  it('requires x-school-id (400)', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=1').set(auth(KEYS.superadmin));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SCHOOL_REQUIRED');
  });

  it('rejects an unknown x-school-id (404)', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/search?query=1')
      .set(auth(KEYS.superadmin))
      .set('x-school-id', 'no-such-school');
    expect(res.status).toBe(404);
  });

  it('reads the selected school and records overrides as SUPERADMIN', async () => {
    const south = await studentOf(SOUTH);
    const record = await prisma.attendanceRecord.create({
      data: { studentId: south.id, date: new Date('2026-01-05'), status: 'ABSENT', updatedByRole: 'SYSTEM' },
    });

    const search = await request(app)
      .get('/api/v1/attendance/search?query=1-A')
      .set(auth(KEYS.superadmin))
      .set('x-school-id', SOUTH);
    expect(search.status).toBe(200);
    expect(search.body.results.map((s: { id: string }) => s.id)).toContain(south.id);

    const res = await request(app)
      .patch(`/api/v1/attendance/record/${record.id}`)
      .set(auth(KEYS.superadmin))
      .set('x-school-id', SOUTH)
      .send({ status: 'EXCUSED', note: 'Support fix' });
    expect(res.status).toBe(200);
    expect(res.body.updatedByRole).toBe('SUPERADMIN');
  });
});

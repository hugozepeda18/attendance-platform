import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
});

// ─── Group Analytics ─────────────────────────────────────────────────────────

describe('GET /api/v1/attendance/analytics/group/:grade/:group', () => {
  it('returns summary for a valid group with no records today', async () => {
    const res = await request(app).get('/api/v1/attendance/analytics/group/1/A');
    expect(res.status).toBe(200);
    expect(res.body.grade).toBe(1);
    expect(res.body.group).toBe('A');
    expect(res.body.today.total).toBe(5);
    expect(res.body.today.present).toBe(0);
    expect(res.body.today.tardy).toBe(0);
    expect(res.body.today.absent).toBe(0);
    expect(res.body.thirtyDayRate).toBe(0);
    expect(res.body.students).toHaveLength(5);
  });

  it('reflects a scanned student in today counts', async () => {
    await request(app).post('/api/v1/attendance/scan').send({ credentialUid: 'CARD-1A-01' });

    const res = await request(app).get('/api/v1/attendance/analytics/group/1/A');
    expect(res.status).toBe(200);
    expect(res.body.today.present + res.body.today.tardy).toBe(1);
    expect(res.body.thirtyDayRate).toBeGreaterThan(0);
  });

  it('student list has required fields including risk flags', async () => {
    const res = await request(app).get('/api/v1/attendance/analytics/group/2/B');
    expect(res.status).toBe(200);
    const student = res.body.students[0];
    expect(student).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      credentialUid: expect.any(String),
      todayStatus: null,
      thirtyDayPresent: 0,
      thirtyDayTardy: 0,
      thirtyDayAbsent: 0,
      isHabituallyTardy: false,
      isChronicAbsentee: false,
    });
  });

  it('returns 404 for a group with no students', async () => {
    const res = await request(app).get('/api/v1/attendance/analytics/group/9/Z');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

// ─── Student Analytics ────────────────────────────────────────────────────────

describe('GET /api/v1/attendance/analytics/student/:id', () => {
  it('returns student profile with empty timeline when no records exist', async () => {
    const student = await prisma.student.findFirst({ where: { credentialUid: 'CARD-1A-01' } });

    const res = await request(app).get(`/api/v1/attendance/analytics/student/${student!.id}`);
    expect(res.status).toBe(200);
    expect(res.body.student.credentialUid).toBe('CARD-1A-01');
    expect(res.body.timeline).toEqual([]);
    expect(res.body.isHabituallyTardy).toBe(false);
    expect(res.body.isChronicAbsentee).toBe(false);
  });

  it('populates timeline after a scan', async () => {
    await request(app).post('/api/v1/attendance/scan').send({ credentialUid: 'CARD-2A-01' });

    const student = await prisma.student.findFirst({ where: { credentialUid: 'CARD-2A-01' } });
    const res = await request(app).get(`/api/v1/attendance/analytics/student/${student!.id}`);

    expect(res.status).toBe(200);
    expect(res.body.timeline).toHaveLength(1);
    const entry = res.body.timeline[0];
    expect(entry).toMatchObject({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      status: expect.stringMatching(/^(PRESENT|TARDY)$/),
      scanTimestamp: expect.any(String),
    });
  });

  it('returns student profile with all required fields', async () => {
    const student = await prisma.student.findFirst({ where: { credentialUid: 'CARD-3B-01' } });
    const res = await request(app).get(`/api/v1/attendance/analytics/student/${student!.id}`);

    expect(res.status).toBe(200);
    expect(res.body.student).toMatchObject({
      id: expect.any(String),
      firstName: expect.any(String),
      lastName: expect.any(String),
      grade: expect.any(Number),
      group: expect.any(String),
      credentialUid: 'CARD-3B-01',
      guardianName: expect.any(String),
      guardianWhatsApp: expect.stringMatching(/^\+\d+$/),
    });
  });

  it('returns 404 for an unknown student ID', async () => {
    const res = await request(app).get(
      '/api/v1/attendance/analytics/student/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

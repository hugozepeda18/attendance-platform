import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
});

describe('GET /api/v1/attendance/search', () => {
  it('returns 400 when query param is missing', async () => {
    const res = await request(app).get('/api/v1/attendance/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_INPUT');
  });

  it('searches students by group format "1-A" and returns 5 results', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=1-A');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(5);
    res.body.results.forEach((s: { grade: number; group: string }) => {
      expect(s.grade).toBe(1);
      expect(s.group).toBe('A');
    });
  });

  it('searches by grade "1" and returns 10 results (groups A and B)', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=1');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(10);
  });

  it('searches by partial last name case-insensitively', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=garcia');
    expect(res.status).toBe(200);
    // 3 students have "Garcia" as lastName (indices 0, 10, 20 in seed)
    expect(res.body.results.length).toBeGreaterThan(0);
    res.body.results.forEach((s: { name: string }) => {
      expect(s.name.toLowerCase()).toContain('garcia');
    });
  });

  it('returns empty results for a query that matches nothing', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=ZZZNOMATCH');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });

  it('includes currentStatus for scanned students', async () => {
    await request(app).post('/api/v1/attendance/scan').send({ credentialUid: 'CARD-1A-01' });

    const res = await request(app).get('/api/v1/attendance/search?query=1-A');
    expect(res.status).toBe(200);

    const scanned = res.body.results.find(
      (s: { attendanceOverview: { total: number }; currentStatus: string | null }) =>
        s.attendanceOverview.total > 0,
    );
    expect(scanned).toBeDefined();
    expect(['PRESENT', 'TARDY']).toContain(scanned.currentStatus);
  });

  it('result shape has all required fields', async () => {
    const res = await request(app).get('/api/v1/attendance/search?query=1-A');
    expect(res.status).toBe(200);
    const first = res.body.results[0];
    expect(first).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      grade: expect.any(Number),
      group: expect.any(String),
      currentStatus: null,
      attendanceOverview: {
        present: 0,
        tardy: 0,
        absent: 0,
        excused: 0,
        total: 0,
      },
    });
  });
});

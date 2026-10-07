import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
});

describe('POST /api/v1/attendance/scan', () => {
  it('creates a PRESENT or TARDY record for a valid credential', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/scan')
      .send({ credentialUid: 'CARD-1A-01' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(['PRESENT', 'TARDY']).toContain(res.body.status);
    expect(typeof res.body.student).toBe('string');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('returns 409 on a duplicate scan for the same student today', async () => {
    await request(app)
      .post('/api/v1/attendance/scan')
      .send({ credentialUid: 'CARD-1A-01' });

    const res = await request(app)
      .post('/api/v1/attendance/scan')
      .send({ credentialUid: 'CARD-1A-01' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_SCANNED');
  });

  it('returns 404 for an unknown credentialUid', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/scan')
      .send({ credentialUid: 'CARD-DOES-NOT-EXIST' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('STUDENT_NOT_FOUND');
  });

  it('returns 400 when credentialUid is missing', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/scan')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_INPUT');
  });
});

describe('evaluateAbsences (via service)', () => {
  it('marks students without a record today as ABSENT', async () => {
    const { evaluateAbsences } = await import('../../src/services/attendance.service');

    // Scan one student first so they are NOT absent
    await request(app)
      .post('/api/v1/attendance/scan')
      .send({ credentialUid: 'CARD-1A-01' });

    const silentNotifier = {
      sendScanAlert: async () => {},
      sendAbsenceAlert: async () => {},
    };

    const markedCount = await evaluateAbsences(silentNotifier);

    // 30 total students - 1 scanned = 29 should be marked absent
    expect(markedCount).toBe(29);

    const absentRecords = await prisma.attendanceRecord.findMany({
      where: { status: 'ABSENT' },
    });
    expect(absentRecords).toHaveLength(29);
  });
});

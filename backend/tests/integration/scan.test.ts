import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { auth, KEYS, NORTH, setMexicoCityTime } from '../helpers';
import { processScan } from '../../src/services/attendance.service';

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
  setMexicoCityTime('07:55');
});

describe('POST /api/v1/attendance/scan', () => {
  it('creates a PRESENT or TARDY record for a valid credential', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/scan')
      .set(auth(KEYS.northScanner))
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
      .set(auth(KEYS.northScanner))
      .send({ credentialUid: 'CARD-1A-01' });

    const res = await request(app)
      .post('/api/v1/attendance/scan')
      .set(auth(KEYS.northScanner))
      .send({ credentialUid: 'CARD-1A-01' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_SCANNED');
  });

  it('returns 404 for an unknown credentialUid', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/scan')
      .set(auth(KEYS.northScanner))
      .send({ credentialUid: 'CARD-DOES-NOT-EXIST' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('STUDENT_NOT_FOUND');
  });

  it('returns 400 when credentialUid is missing', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/scan')
      .set(auth(KEYS.northScanner))
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
      .set(auth(KEYS.northScanner))
      .send({ credentialUid: 'CARD-1A-01' });

    const markedCount = await evaluateAbsences(NORTH);

    // 30 students in this school - 1 scanned = 29 should be marked absent
    expect(markedCount).toBe(29);

    const absentRecords = await prisma.attendanceRecord.findMany({
      where: { status: 'ABSENT' },
    });
    expect(absentRecords).toHaveLength(29);
  });
});

// Seeded "norte": start 08:00, grace 10 min, window (absenceCutoffMinutes) 30 min → absent from 08:30.
describe('Attendance window (Phase 13)', () => {
  const scan = (credentialUid = 'CARD-1A-01') =>
    request(app).post('/api/v1/attendance/scan').set(auth(KEYS.northScanner)).send({ credentialUid });
  const studentId = async () =>
    (await prisma.student.findUniqueOrThrow({ where: { schoolId_credentialUid: { schoolId: NORTH, credentialUid: 'CARD-1A-01' } } })).id;

  it('PRESENT up to start + grace', async () => {
    setMexicoCityTime('08:10');
    expect((await scan()).body.status).toBe('PRESENT');
  });

  it('TARDY inside the window', async () => {
    setMexicoCityTime('08:29');
    expect((await scan()).body.status).toBe('TARDY');
  });

  it('after the window: 422 OUTSIDE_WINDOW, nothing saved, no message', async () => {
    setMexicoCityTime('08:30');
    const res = await scan();
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('OUTSIDE_WINDOW');
    expect(await prisma.attendanceRecord.count()).toBe(0);
    expect((await processScan(NORTH, { credentialUid: 'CARD-1A-01' })).result).toBe('OUTSIDE_WINDOW');
    expect(await prisma.notification.count()).toBe(0);
  });

  it('after the window, the absence run result is untouched (no correction)', async () => {
    const { evaluateAbsences } = await import('../../src/services/attendance.service');
    setMexicoCityTime('08:30');
    await evaluateAbsences(NORTH);
    setMexicoCityTime('09:20');
    expect((await scan()).status).toBe(422);
    const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId: await studentId() } });
    expect(record.status).toBe('ABSENT');
    expect(record.scanTimestamp).toBeNull();
  });

  it('a duplicate scan after the window still says ALREADY_SCANNED', async () => {
    setMexicoCityTime('08:05');
    await scan();
    setMexicoCityTime('09:00');
    expect((await scan()).status).toBe(409);
  });

  it('an excused student who arrives inside the window is recorded as arrived; the note is kept', async () => {
    await prisma.attendanceRecord.create({
      data: { studentId: await studentId(), date: new Date('2026-10-06'), status: 'EXCUSED', note: 'Cita médica', updatedByRole: 'PRINCIPAL' },
    });
    setMexicoCityTime('08:20');
    const res = await scan();
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('TARDY');
    const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId: await studentId() } });
    expect(record).toMatchObject({ status: 'TARDY', note: 'Cita médica', updatedByRole: 'SCANNER' });
    expect(record.scanTimestamp).not.toBeNull();
  });
});

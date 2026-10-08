import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { evaluateAbsences } from '../../src/services/attendance.service';
import { auth, DEV_PASSWORD, KEYS, NORTH, outbox, SOUTH, setMexicoCityTime } from '../helpers';

// Frozen clock: Tuesday 2026-10-06. Seeded "norte": start 08:00, absence run at 08:30.
let staff: string;
let staffId: string;
let studentId: string;

const excuse = (body: object, token = staff) =>
  request(app).post('/api/v1/attendance/excuses').set(auth(token)).send(body);

beforeAll(async () => {
  const login = await request(app).post('/api/v1/auth/login').send({ school: 'norte', email: 'staff@norte.test', password: DEV_PASSWORD });
  ({ token: staff, user: { id: staffId } } = login.body);
  studentId = (await prisma.student.findUniqueOrThrow({ where: { schoolId_credentialUid: { schoolId: NORTH, credentialUid: 'CARD-1A-01' } } })).id;
});

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
  setMexicoCityTime('07:30');
});

afterAll(async () => {
  await prisma.attendanceRecord.deleteMany({});
  await prisma.$disconnect();
});

describe('Excuse in advance (Phase 13b)', () => {
  it('staff excuses a student for today: no absence notice at the cutoff', async () => {
    const res = await excuse({ studentId, from: '2026-10-06', reason: 'Cita médica' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ excused: ['2026-10-06'], skipped: [] });

    setMexicoCityTime('08:30');
    await evaluateAbsences(NORTH);
    const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId } });
    expect(record).toMatchObject({ status: 'EXCUSED', note: 'Cita médica', updatedByRole: 'STAFF', updatedByUserId: staffId });
    expect(await outbox(prisma, 'ABSENCE')).toHaveLength(29); // the rest of the school, not the excused student
  });

  it('a range covers school days only (Fri → Mon skips the weekend)', async () => {
    const res = await excuse({ studentId, from: '2026-10-09', to: '2026-10-12', reason: 'Enfermedad' });
    expect(res.body.excused).toEqual(['2026-10-09', '2026-10-12']);
  });

  it('days that already have a record are skipped and left untouched', async () => {
    setMexicoCityTime('07:50');
    await request(app).post('/api/v1/attendance/scan').set(auth(KEYS.northScanner)).send({ credentialUid: 'CARD-1A-01' });
    const res = await excuse({ studentId, from: '2026-10-06', to: '2026-10-07', reason: 'Asunto familiar' });
    expect(res.body).toEqual({ excused: ['2026-10-07'], skipped: ['2026-10-06'] });
    const today = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId, date: new Date('2026-10-06') } });
    expect(today.status).toBe('PRESENT');
  });

  it('rejects today after the window closed, past days, inverted, too long and weekend-only ranges', async () => {
    setMexicoCityTime('08:30');
    expect((await excuse({ studentId, from: '2026-10-06', reason: 'x' })).status).toBe(400);
    setMexicoCityTime('07:30');
    for (const body of [
      { from: '2026-10-05' },
      { from: '2026-10-08', to: '2026-10-07' },
      { from: '2026-10-07', to: '2026-11-30' },
      { from: '2026-10-10', to: '2026-10-11' },
    ]) {
      const res = await excuse({ studentId, reason: 'x', ...body });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('EXCUSE_NOT_ALLOWED');
    }
    expect(await prisma.attendanceRecord.count()).toBe(0);
  });

  it('validates input', async () => {
    expect((await excuse({ studentId, from: '06/10/2026', reason: 'x' })).status).toBe(400);
    expect((await excuse({ studentId, from: '2026-10-06', reason: '  ' })).status).toBe(400);
  });

  it('scanners cannot excuse; other schools\' students are not found', async () => {
    expect((await excuse({ studentId, from: '2026-10-06', reason: 'x' }, KEYS.northScanner)).status).toBe(403);
    const southStudent = await prisma.student.findUniqueOrThrow({ where: { schoolId_credentialUid: { schoolId: SOUTH, credentialUid: 'CARD-1A-01' } } });
    expect((await excuse({ studentId: southStudent.id, from: '2026-10-06', reason: 'x' })).status).toBe(404);
  });

  it('staff can excuse but cannot change an existing record (principal only)', async () => {
    await excuse({ studentId, from: '2026-10-06', reason: 'Cita médica' });
    const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId } });
    const res = await request(app).patch(`/api/v1/attendance/record/${record.id}`).set(auth(staff)).send({ status: 'ABSENT' });
    expect(res.status).toBe(403);
  });

  it('the student history shows the excuse, its reason and who registered it, including future days', async () => {
    await excuse({ studentId, from: '2026-10-06', to: '2026-10-08', reason: 'Cita médica' });
    const res = await request(app).get(`/api/v1/attendance/analytics/student/${studentId}`).set(auth(staff));
    expect(res.body.timeline).toEqual([
      expect.objectContaining({ date: '2026-10-06', status: 'EXCUSED', note: 'Cita médica', updatedByName: 'Prefecto norte' }),
    ]);
    expect(res.body.upcomingExcuses.map((e: { date: string }) => e.date)).toEqual(['2026-10-07', '2026-10-08']);
  });
});

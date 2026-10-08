import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { evaluateAbsences } from '../../src/services/attendance.service';
import { auth, DEV_PASSWORD, NORTH, outbox, setMexicoCityTime, signIn } from '../helpers';

// Staff request a status change; only the principal approves (or rejects) it. Clock: Tue 2026-10-06.
let principal: string;
let staff: string;
let staff2: string;
let southPrincipal: string;
let southStaff: string;
let studentId: string;
const EMAIL2 = 'staff2-change-test@norte.test';

const change = (body: object, token = staff) => request(app).post('/api/v1/attendance/changes').set(auth(token)).send(body);
const list = (token: string, q = '') => request(app).get(`/api/v1/attendance/changes${q}`).set(auth(token));
const decide = (id: string, verb: 'approve' | 'reject', token = principal) =>
  request(app).post(`/api/v1/attendance/changes/${id}/${verb}`).set(auth(token));
const record = (date = '2026-10-06') => prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId, date: new Date(date) } } });

beforeAll(async () => {
  [principal, staff, southPrincipal, southStaff] = await Promise.all([
    signIn('norte', 'principal@norte.test'),
    signIn('norte', 'staff@norte.test'),
    signIn('sur', 'principal@sur.test'),
    signIn('sur', 'staff@sur.test'),
  ]);
  await prisma.user.deleteMany({ where: { email: EMAIL2 } });
  await request(app).post('/api/v1/users').set(auth(principal)).send({ email: EMAIL2, name: 'Otra Prefecta', role: 'STAFF', password: DEV_PASSWORD });
  staff2 = await signIn('norte', EMAIL2);
  studentId = (await prisma.student.findFirstOrThrow({ where: { schoolId: NORTH, credentialUid: 'CARD-1A-01' } })).id;
});

beforeEach(async () => {
  await prisma.changeRequest.deleteMany({});
  await prisma.attendanceRecord.deleteMany({});
  setMexicoCityTime('09:15');
});

afterAll(async () => {
  await prisma.changeRequest.deleteMany({});
  await prisma.attendanceRecord.deleteMany({});
  await prisma.session.deleteMany({ where: { user: { email: EMAIL2 } } });
  await prisma.user.deleteMany({ where: { email: EMAIL2 } });
  await prisma.$disconnect();
});

describe('Change requests', () => {
  it('staff request ABSENT → TARDY; nothing changes until the principal approves', async () => {
    await evaluateAbsences(NORTH); // after the cutoff: the student is ABSENT
    const res = await change({ studentId, date: '2026-10-06', status: 'TARDY', reason: 'Llegó 9:10 con su mamá' });
    expect(res.status).toBe(202);
    expect(res.body.request).toMatchObject({ fromStatus: 'ABSENT', toStatus: 'TARDY', state: 'PENDING', requestedBy: 'Prefecto norte' });
    expect((await record())!.status).toBe('ABSENT');

    const inbox = await list(principal, '?state=PENDING');
    expect(inbox.body.pending).toBe(1);
    expect(inbox.body.requests[0].student.name).toBeTruthy();

    expect((await decide(res.body.request.id, 'approve', staff)).status).toBe(403);
    expect((await decide(res.body.request.id, 'approve')).body.state).toBe('APPROVED');
    expect(await record()).toMatchObject({ status: 'TARDY', note: 'Llegó 9:10 con su mamá', updatedByRole: 'PRINCIPAL' });
    expect((await decide(res.body.request.id, 'reject')).status).toBe(409);
  });

  it('a late arrival registered before the absence run: no absence notice', async () => {
    setMexicoCityTime('08:25');
    const res = await change({ studentId, date: '2026-10-06', status: 'TARDY', reason: 'Registrar llegada' });
    expect(res.body.request.fromStatus).toBeNull();
    await decide(res.body.request.id, 'approve');

    setMexicoCityTime('08:30');
    await evaluateAbsences(NORTH);
    expect(await outbox(prisma, 'ABSENCE')).toHaveLength(29);
    expect((await record())!.status).toBe('TARDY');
  });

  it('rejecting leaves the record as it was', async () => {
    await evaluateAbsences(NORTH);
    const { body } = await change({ studentId, date: '2026-10-06', status: 'EXCUSED', reason: 'x' });
    expect((await decide(body.request.id, 'reject')).body.state).toBe('REJECTED');
    expect((await record())!.status).toBe('ABSENT');
    expect((await list(staff)).body.requests[0]).toMatchObject({ state: 'REJECTED', decidedBy: 'Director norte' });
  });

  it('the principal changes a day directly (no request)', async () => {
    const res = await change({ studentId, date: '2026-10-05', status: 'EXCUSED', reason: 'Justificante' }, principal);
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect((await record('2026-10-05'))!.status).toBe('EXCUSED');
    expect(await prisma.changeRequest.count()).toBe(0);
  });

  it('rules: one pending per day, no future days, not older than 30 days, must change something', async () => {
    const body = { studentId, date: '2026-10-06', status: 'TARDY', reason: 'x' };
    expect((await change(body)).status).toBe(202);
    expect((await change(body)).body.error).toBe('ALREADY_REQUESTED');
    expect((await change({ ...body, date: '2026-10-07' })).body.error).toBe('FUTURE_DATE');
    expect((await change({ ...body, date: '2026-09-01' })).body.error).toBe('TOO_OLD');
    await evaluateAbsences(NORTH);
    expect((await change({ ...body, date: '2026-10-06', status: 'ABSENT' }, principal)).body.error).toBe('NO_CHANGE');
    expect((await change({ ...body, reason: '' })).status).toBe(400);
  });

  it('staff see only their own requests; the principal sees all', async () => {
    await change({ studentId, date: '2026-10-06', status: 'TARDY', reason: 'mine' });
    await change({ studentId, date: '2026-10-05', status: 'EXCUSED', reason: 'theirs' }, staff2);
    expect((await list(staff)).body.requests.map((r: { reason: string }) => r.reason)).toEqual(['mine']);
    expect((await list(staff)).body.pending).toBeUndefined();
    expect((await list(principal)).body.requests).toHaveLength(2);
  });

  it('isolation: another school cannot see, request on or decide North requests', async () => {
    const { body } = await change({ studentId, date: '2026-10-06', status: 'TARDY', reason: 'x' });
    expect((await change({ studentId, date: '2026-10-06', status: 'TARDY', reason: 'x' }, southStaff)).status).toBe(404);
    expect((await decide(body.request.id, 'approve', southPrincipal)).status).toBe(404);
    expect((await list(southPrincipal)).body).toEqual({ requests: [], pending: 0 });
    expect(await record()).toBeNull();
  });
});

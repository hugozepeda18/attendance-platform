import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { notifier } from '../../src/services/notifier';
import { runAbsenceTick } from '../../src/jobs/absence.job';
import { auth, KEYS, NORTH, SOUTH, setMexicoCityTime } from '../helpers';

// Seeded "norte": start 08:00, grace 10, window 30 → PRESENT ≤ 08:10, TARDY < 08:30, absent from 08:30.
// Mexico City = UTC-6; the faked day is Tuesday 2026-10-06.
const mx = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 6, h + 6, m)).toISOString();
};
const batch = (key: string, sentAt: string, events: object[]) =>
  request(app).post('/api/v1/attendance/scans').set(auth(key)).send({ sentAt, events });
const heartbeat = (key: string, pending: number) =>
  request(app).post('/api/v1/gate/heartbeat').set(auth(key)).send({ pending });

let entryMessages: jest.SpyInstance;
let eventSeq = 0;
const ev = () => `test-evt-${Date.now()}-${++eventSeq}`;

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
  await prisma.scanEvent.deleteMany({});
  await prisma.schoolConfig.updateMany({ data: { absenceRunOn: null } });
  await prisma.apiKey.updateMany({ data: { lastSeenAt: null, pendingScans: 0 } });
  entryMessages = jest.spyOn(notifier, 'sendScanAlert').mockResolvedValue();
  setMexicoCityTime('07:55');
});

afterEach(() => entryMessages.mockRestore());

afterAll(async () => {
  await prisma.attendanceRecord.deleteMany({});
  await prisma.scanEvent.deleteMany({});
  await prisma.schoolConfig.updateMany({ data: { absenceRunOn: null, dropLeadingZeros: false } });
  await prisma.$disconnect();
});

describe('POST /attendance/scans (offline queue upload)', () => {
  it('an old queued scan keeps its real time: TARDY at 08:15 even when uploaded at 09:00', async () => {
    setMexicoCityTime('09:00');
    const res = await batch(KEYS.northScanner, mx('09:00'), [{ eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('08:15') }]);
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ result: 'TARDY', studentName: expect.any(String), grade: 1, group: 'A', scannedAt: mx('08:15'), clockSkew: false });
    const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { student: { schoolId: NORTH, credentialUid: 'CARD-1A-01' } } });
    expect(record.scanTimestamp!.toISOString()).toBe(mx('08:15'));
    expect(entryMessages).toHaveBeenCalledTimes(1);
  });

  it('corrects a device clock running 7 minutes slow', async () => {
    // Real time 08:12 (TARDY). The device clock shows 08:04 at the scan and 08:05 when sending.
    setMexicoCityTime('08:12');
    const res = await batch(KEYS.northScanner, mx('08:05'), [{ eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('08:04') }]);
    expect(res.body.results[0]).toMatchObject({ result: 'TARDY', scannedAt: mx('08:11') });
  });

  it('a scan time in the future falls back to server time and is flagged', async () => {
    setMexicoCityTime('08:05');
    const res = await batch(KEYS.northScanner, mx('08:05'), [{ eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('08:20') }]);
    expect(res.body.results[0]).toMatchObject({ result: 'PRESENT', scannedAt: mx('08:05'), clockSkew: true });
  });

  it('a resent event returns the original result and sends no second message', async () => {
    const event = { eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('07:50') };
    const first = await batch(KEYS.northScanner, mx('07:55'), [event]);
    const again = await batch(KEYS.northScanner, mx('07:56'), [event]);
    expect(first.body.results[0].result).toBe('PRESENT');
    expect(again.body).toEqual(first.body);
    expect(entryMessages).toHaveBeenCalledTimes(1);
    expect(await prisma.attendanceRecord.count()).toBe(1);
  });

  it('a different event for the same student is ALREADY_SCANNED', async () => {
    await batch(KEYS.northScanner, mx('07:55'), [{ eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('07:50') }]);
    const res = await batch(KEYS.northScanner, mx('07:55'), [{ eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('07:54') }]);
    expect(res.body.results[0]).toMatchObject({ result: 'ALREADY_SCANNED', studentName: expect.any(String) });
  });

  it('each event gets its own result; an unknown badge does not block the rest', async () => {
    const res = await batch(KEYS.northScanner, mx('07:55'), [
      { eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('07:50') },
      { eventId: ev(), credentialUid: 'NOPE', scannedAt: mx('07:51') },
      { eventId: ev(), credentialUid: 'CARD-1A-02', scannedAt: mx('07:52') },
    ]);
    expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(['PRESENT', 'NOT_FOUND', 'PRESENT']);
  });

  it('a queued in-window scan arriving after the absence run fixes the record without a message', async () => {
    setMexicoCityTime('08:30');
    await runAbsenceTick();
    setMexicoCityTime('08:40');
    const res = await batch(KEYS.northScanner, mx('08:40'), [{ eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('08:20') }]);
    expect(res.body.results[0].result).toBe('TARDY');
    const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { student: { schoolId: NORTH, credentialUid: 'CARD-1A-01' } } });
    expect(record.status).toBe('TARDY');
    expect(entryMessages).not.toHaveBeenCalled();
  });

  it('a scan older than 2 h is recorded but not announced', async () => {
    setMexicoCityTime('10:10');
    const res = await batch(KEYS.northScanner, mx('10:10'), [{ eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('08:05') }]);
    expect(res.body.results[0].result).toBe('PRESENT');
    expect(entryMessages).not.toHaveBeenCalled();
  });

  it('rejects malformed uploads', async () => {
    await batch(KEYS.northScanner, 'yesterday', [{ eventId: ev(), credentialUid: 'X', scannedAt: mx('07:50') }]).expect(400);
    await batch(KEYS.northScanner, mx('07:55'), []).expect(400);
    await batch(KEYS.northScanner, mx('07:55'), [{ credentialUid: 'X', scannedAt: mx('07:50') }]).expect(400);
    await request(app).post('/api/v1/attendance/scans').send({ sentAt: mx('07:55'), events: [] }).expect(401);
  });
});

describe('POST /attendance/scan (single, gate fields)', () => {
  it('returns name, grade and group; the duplicate says alreadyScanned', async () => {
    const scan = (body: object) => request(app).post('/api/v1/attendance/scan').set(auth(KEYS.northScanner)).send(body);
    const first = await scan({ credentialUid: ' ;CARD-1A-01? ' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: 'PRESENT', grade: 1, group: 'A', alreadyScanned: false });
    const dup = await scan({ credentialUid: 'card-1a-01' });
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ alreadyScanned: true, student: first.body.student, grade: 1, group: 'A' });
  });

  it('matches numeric badges without leading zeros when the school enables it', async () => {
    const student = await prisma.student.create({
      data: { schoolId: NORTH, credentialUid: '4521873', firstName: 'Num', lastName: 'Badge', grade: 2, group: 'B', guardianName: 'G', guardianWhatsApp: '+520000000000' },
    });
    try {
      const scan = (credentialUid: string | number) =>
        request(app).post('/api/v1/attendance/scan').set(auth(KEYS.northScanner)).send({ credentialUid });
      expect((await scan('0004521873')).status).toBe(404);
      const patch = await request(app).patch(`/api/v1/admin/schools/${NORTH}`).set(auth(KEYS.superadmin)).send({ dropLeadingZeros: true });
      expect(patch.body.config.dropLeadingZeros).toBe(true);
      expect((await scan('0004521873')).status).toBe(201);
      await prisma.attendanceRecord.deleteMany({ where: { studentId: student.id } });
      expect((await scan(4521873)).status).toBe(201); // reader sent a JSON number
    } finally {
      await prisma.schoolConfig.update({ where: { schoolId: NORTH }, data: { dropLeadingZeros: false } });
      await prisma.attendanceRecord.deleteMany({ where: { studentId: student.id } });
      await prisma.student.delete({ where: { id: student.id } });
    }
  });
});

describe('POST /gate/heartbeat', () => {
  it('records last seen and pending scans for the calling key', async () => {
    const res = await heartbeat(KEYS.northScanner, 4);
    expect(res.status).toBe(200);
    expect(res.body.serverTime).toBe(mx('07:55'));
    const key = await prisma.apiKey.findFirstOrThrow({ where: { schoolId: NORTH, role: 'SCANNER' } });
    expect(key).toMatchObject({ pendingScans: 4, lastSeenAt: new Date(mx('07:55')) });
  });

  it('only gate scanner keys may send heartbeats', async () => {
    await heartbeat(KEYS.northStaff, 0).expect(403);
    await request(app).post('/api/v1/gate/heartbeat').set(auth(KEYS.superadmin)).set('x-school-id', NORTH).send({ pending: 0 }).expect(400);
    await heartbeat(KEYS.northScanner, -1).expect(400);
  });
});

describe('Absence run waits for gates', () => {
  it('a gate with pending scans at the cutoff delays the run until it syncs', async () => {
    setMexicoCityTime('08:29');
    await heartbeat(KEYS.northScanner, 2);
    setMexicoCityTime('08:30');
    expect(await runAbsenceTick()).toEqual([]);

    // The queued scan arrives, then the gate reports an empty queue.
    setMexicoCityTime('08:33');
    await batch(KEYS.northScanner, mx('08:33'), [{ eventId: ev(), credentialUid: 'CARD-1A-01', scannedAt: mx('08:20') }]);
    await heartbeat(KEYS.northScanner, 0);
    setMexicoCityTime('08:34');
    expect(await runAbsenceTick()).toEqual([NORTH]);

    expect(await prisma.attendanceRecord.count({ where: { student: { schoolId: NORTH }, status: 'ABSENT' } })).toBe(29);
    const arrived = await prisma.attendanceRecord.findFirstOrThrow({ where: { student: { schoolId: NORTH, credentialUid: 'CARD-1A-01' } } });
    expect(arrived.status).toBe('TARDY');

    // Runs once per day
    setMexicoCityTime('08:35');
    expect(await runAbsenceTick()).toEqual([]);
  });

  it('an offline gate delays the run at most 30 minutes', async () => {
    setMexicoCityTime('08:29');
    await heartbeat(KEYS.northScanner, 0);
    const noop = async () => undefined;
    setMexicoCityTime('08:45'); // last heartbeat 16 min ago → offline
    expect(await runAbsenceTick(new Date(), noop)).toEqual([]);
    setMexicoCityTime('09:00');
    expect(await runAbsenceTick(new Date(), noop)).toEqual([NORTH]);
  });

  it('a gate seen recently and synced does not delay the run', async () => {
    setMexicoCityTime('08:30');
    await heartbeat(KEYS.northScanner, 0);
    expect(await runAbsenceTick(new Date(), async () => undefined)).toEqual([NORTH]);
  });
});

describe('Tenant isolation', () => {
  it("a school's gate cannot scan another school's badge, and eventIds are per school", async () => {
    const southOnly = await prisma.student.create({
      data: { schoolId: SOUTH, credentialUid: 'SOUTH-ONLY-1', firstName: 'Sur', lastName: 'Only', grade: 1, group: 'A', guardianName: 'G', guardianWhatsApp: '+520000000001' },
    });
    try {
      const eventId = ev();
      const north = await batch(KEYS.northScanner, mx('07:55'), [{ eventId, credentialUid: 'SOUTH-ONLY-1', scannedAt: mx('07:50') }]);
      expect(north.body.results[0].result).toBe('NOT_FOUND');
      // Same eventId at the other school is a different event (not a replay of north's NOT_FOUND).
      // 07:50 Mexico City is 06:50 in Tijuana, before school starts there: PRESENT.
      const south = await batch(KEYS.southScanner, mx('07:55'), [{ eventId, credentialUid: 'SOUTH-ONLY-1', scannedAt: mx('07:50') }]);
      expect(south.body.results[0].result).toBe('PRESENT');
    } finally {
      await prisma.attendanceRecord.deleteMany({ where: { studentId: southOnly.id } });
      await prisma.student.delete({ where: { id: southOnly.id } });
    }
  });

  it("another school's pending gate does not delay this school's run", async () => {
    setMexicoCityTime('08:29');
    await heartbeat(KEYS.southScanner, 5);
    setMexicoCityTime('08:30');
    expect(await runAbsenceTick(new Date(), async () => undefined)).toEqual([NORTH]);
  });
});

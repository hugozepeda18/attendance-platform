import { createHmac } from 'crypto';
import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { evaluateAbsences, processScan } from '../../src/services/attendance.service';
import { deliverDue, purgeOldLogs } from '../../src/services/outbox.service';
import { NotifierService, SendError, OutgoingMessage } from '../../src/services/notifier';
import { runAbsenceTick } from '../../src/jobs/absence.job';
import { auth, KEYS, NORTH, outbox, setMexicoCityTime, signIn } from '../helpers';

// Phase 15: scans and the absence run write messages to the outbox; the worker (deliverDue) sends them.
// Clock: Tue 2026-10-06, Mexico City (UTC-6). Seeded "norte": start 08:00, grace 10, cutoff 08:30.
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 6, h + 6, m));
};
const PRINCIPAL_PHONE = '+5215500000001';
const SECRET = 'test-app-secret';

let sent: OutgoingMessage[];
const provider = (fail?: (n: number) => Error | null): NotifierService => ({
  name: 'fake',
  async send(m) {
    const err = fail?.(sent.length);
    if (err) throw err;
    sent.push(m);
    return `wamid.${sent.length}`;
  },
});
const scan = (credentialUid: string) => processScan(NORTH, { credentialUid });
const student = (credentialUid: string) =>
  prisma.student.findUniqueOrThrow({ where: { schoolId_credentialUid: { schoolId: NORTH, credentialUid } } });

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
  await prisma.notification.deleteMany({});
  sent = [];
  setMexicoCityTime('07:55');
});

afterAll(async () => {
  await prisma.attendanceRecord.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.changeRequest.deleteMany({});
  await prisma.schoolConfig.updateMany({ data: { principalWhatsApp: null, absenceRunOn: null } });
  await prisma.apiKey.updateMany({ data: { lastSeenAt: null, pendingScans: 0 } });
  await prisma.$disconnect();
});

describe('Outbox delivery (Phase 15)', () => {
  it('a scan writes its message with the record; the worker sends it once, 2 min later', async () => {
    await scan('CARD-1A-01');
    const [row] = await outbox(prisma, 'ENTRY');
    const s = await student('CARD-1A-01');
    expect(row).toMatchObject({ template: 'entrada', phone: s.guardianWhatsApp, params: [`${s.firstName} ${s.lastName}`, '07:55'], status: 'PENDING' });

    expect(await deliverDue(provider(), at('07:56'))).toBe(0); // waiting for siblings
    expect(await deliverDue(provider(), at('07:57'))).toBe(1);
    expect(await deliverDue(provider(), at('07:58'))).toBe(0);
    expect(sent).toEqual([{ phone: s.guardianWhatsApp, template: 'entrada', params: ['Secundaria Demo Norte', `${s.firstName} ${s.lastName}`, '07:55'] }]);
    expect((await outbox(prisma))[0]).toMatchObject({ status: 'SENT', providerId: 'wamid.1', attempts: 1 });
  });

  it('a tardy arrival uses the retardo template', async () => {
    setMexicoCityTime('08:20');
    await scan('CARD-1A-01');
    expect((await outbox(prisma, 'ENTRY'))[0].template).toBe('entrada_retardo');
  });

  it('siblings arriving within 2 min to the same phone: one message', async () => {
    const [a, b] = [await student('CARD-1A-01'), await student('CARD-2B-03')];
    await prisma.student.update({ where: { id: b.id }, data: { guardianWhatsApp: a.guardianWhatsApp } });
    try {
      await scan('CARD-1A-01');
      setMexicoCityTime('07:56');
      await scan('CARD-2B-03');
      expect(await deliverDue(provider(), at('07:57'))).toBe(1);
      expect(sent).toHaveLength(1);
      expect(sent[0].params[1]).toBe(`${a.firstName} ${a.lastName} y ${b.firstName} ${b.lastName}`);
      expect((await outbox(prisma)).map((r) => [r.status, r.providerId])).toEqual([['SENT', 'wamid.1'], ['SENT', 'wamid.1']]);
    } finally {
      await prisma.student.update({ where: { id: b.id }, data: { guardianWhatsApp: b.guardianWhatsApp } });
    }
  });

  it('a worker that crashed mid-send: the row comes back after the lease and is sent exactly once', async () => {
    await scan('CARD-1A-01');
    const [row] = await outbox(prisma);
    // what a crashed worker leaves behind: claimed (SENDING, 5 min lease), never finished
    await prisma.notification.update({ where: { id: row.id }, data: { status: 'SENDING', nextAttemptAt: at('08:02') } });
    expect(await deliverDue(provider(), at('08:00'))).toBe(0);
    expect(await deliverDue(provider(), at('08:02'))).toBe(1);
    expect(await deliverDue(provider(), at('08:10'))).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('a failing provider is retried with backoff, then FAILED after 5 attempts', async () => {
    await scan('CARD-1A-01');
    const down = provider(() => new SendError('503 down', false));
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    let t = at('07:57').getTime();
    for (let i = 0; i < 5; i++) {
      expect(await deliverDue(down, new Date(t))).toBe(0);
      const [row] = await outbox(prisma);
      expect(row).toMatchObject({ attempts: i + 1, status: i < 4 ? 'PENDING' : 'FAILED', lastError: '503 down' });
      t = row.nextAttemptAt.getTime();
    }
    expect(await deliverDue(provider(), new Date(t + 3_600_000))).toBe(0);
    errorLog.mockRestore();
  });

  it('a permanent error (bad number) fails at once; a retry that works marks it SENT', async () => {
    await scan('CARD-1A-01');
    await scan('CARD-1A-02');
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const flaky = provider(() => (calls++ === 0 ? new SendError('400 131026 not on WhatsApp', true) : null));
    await deliverDue(flaky, at('07:57'));
    expect((await outbox(prisma)).map((r) => r.status).sort()).toEqual(['FAILED', 'SENT']);
    errorLog.mockRestore();
  });

  it('an entry message the worker could not send within 2 h expires; absence notices still go', async () => {
    await scan('CARD-1A-01');
    setMexicoCityTime('08:30');
    await evaluateAbsences(NORTH);
    expect(await outbox(prisma, 'ABSENCE')).toHaveLength(29);
    expect((await outbox(prisma, 'ABSENCE'))[0].params).toEqual([expect.any(String), '6 de octubre']);

    await deliverDue(provider(), at('11:00'));
    expect((await outbox(prisma, 'ENTRY'))[0].status).toBe('EXPIRED');
    expect(sent).toHaveLength(29);
    expect(sent.every((m) => m.template === 'inasistencia')).toBe(true);
  });

  it('the principal gets a WhatsApp when gates hold the absence run, and for a staff change request', async () => {
    await prisma.schoolConfig.update({ where: { schoolId: NORTH }, data: { principalWhatsApp: PRINCIPAL_PHONE, absenceRunOn: null } });
    const scanner = await prisma.apiKey.findFirstOrThrow({ where: { schoolId: NORTH, role: 'SCANNER' } });
    await prisma.apiKey.update({ where: { id: scanner.id }, data: { lastSeenAt: at('08:29'), pendingScans: 3 } });
    setMexicoCityTime('08:30');
    expect(await runAbsenceTick(at('08:30'))).toEqual([]);
    const [alert] = await outbox(prisma, 'PRINCIPAL_ALERT');
    expect(alert).toMatchObject({ template: 'escaner_en_espera', phone: PRINCIPAL_PHONE, params: [scanner.label] });

    await prisma.notification.deleteMany({});
    setMexicoCityTime('08:20');
    const staff = await signIn('norte', 'staff@norte.test');
    const s = await student('CARD-1A-01');
    const res = await request(app).post('/api/v1/attendance/changes').set(auth(staff))
      .send({ studentId: s.id, date: '2026-10-06', status: 'TARDY', reason: 'Llegó tarde' });
    expect(res.status).toBe(202);
    expect((await outbox(prisma, 'PRINCIPAL_ALERT'))[0]).toMatchObject({
      template: 'solicitud_cambio',
      params: ['Prefecto norte', `${s.firstName} ${s.lastName} (6 de octubre)`],
    });

    await prisma.schoolConfig.update({ where: { schoolId: NORTH }, data: { principalWhatsApp: null } });
    await prisma.changeRequest.deleteMany({});
    await prisma.notification.deleteMany({});
    await request(app).post('/api/v1/attendance/changes').set(auth(staff))
      .send({ studentId: s.id, date: '2026-10-06', status: 'TARDY', reason: 'x' });
    expect(await outbox(prisma, 'PRINCIPAL_ALERT')).toEqual([]); // no principal number: no alert
  });

  it('the student timeline shows the message status', async () => {
    await scan('CARD-1A-01');
    await deliverDue(provider(), at('07:57'));
    const s = await student('CARD-1A-01');
    const res = await request(app).get(`/api/v1/attendance/analytics/student/${s.id}`).set(auth(KEYS.northStaff));
    expect(res.body.timeline.at(-1).messages).toEqual([{ type: 'ENTRY', status: 'SENT' }]);
  });
});

describe('WhatsApp delivery webhook', () => {
  const hook = (payload: object, secret = SECRET) => {
    const body = JSON.stringify(payload);
    return request(app).post('/api/v1/webhooks/whatsapp').set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`).send(body);
  };
  const statuses = (...list: object[]) => ({ entry: [{ changes: [{ value: { statuses: list } }] }] });
  const status = async () => (await outbox(prisma))[0].status;

  beforeAll(() => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
  });

  it('verifies the subscription with the verify token', async () => {
    const q = '/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=';
    expect((await request(app).get(`${q}verify-me`)).text).toBe('12345');
    expect((await request(app).get(`${q}wrong`)).status).toBe(403);
  });

  it('delivered → read; a late "delivered" does not go back; bad signatures are refused', async () => {
    await scan('CARD-1A-01');
    await deliverDue(provider(), at('07:57'));
    expect((await hook(statuses({ id: 'wamid.1', status: 'delivered' }), 'forged')).status).toBe(401);
    expect(await status()).toBe('SENT');

    expect((await hook(statuses({ id: 'wamid.1', status: 'delivered' }))).status).toBe(200);
    expect(await status()).toBe('DELIVERED');
    await hook(statuses({ id: 'wamid.1', status: 'read' }, { id: 'wamid.1', status: 'delivered' }));
    expect(await status()).toBe('READ');
    expect((await hook({ entry: [{ changes: [{ value: { messages: [{ text: 'hola' }] } }] }] })).status).toBe(200); // a reply: ignored
  });

  it('a failed delivery is recorded with the reason', async () => {
    await scan('CARD-1A-01');
    await deliverDue(provider(), at('07:57'));
    await hook(statuses({ id: 'wamid.1', status: 'failed', errors: [{ title: 'Message undeliverable' }] }));
    expect((await outbox(prisma))[0]).toMatchObject({ status: 'FAILED', lastError: 'Message undeliverable' });
  });
});

describe('Privacy (Phase 20)', () => {
  it('a guardian who opted out gets no entry message and no absence notice; attendance is still recorded', async () => {
    const s = await student('CARD-1A-01');
    await prisma.student.update({ where: { id: s.id }, data: { whatsappOptOut: true } });
    try {
      await scan('CARD-1A-01');
      setMexicoCityTime('08:30');
      await prisma.attendanceRecord.deleteMany({ where: { studentId: { not: s.id } } });
      await evaluateAbsences(NORTH);
      expect(await prisma.notification.count({ where: { record: { studentId: s.id } } })).toBe(0);
      expect(await prisma.attendanceRecord.count({ where: { studentId: s.id } })).toBe(1);
      expect(await outbox(prisma, 'ABSENCE')).toHaveLength(29); // everyone else still gets theirs
    } finally {
      await prisma.student.update({ where: { id: s.id }, data: { whatsappOptOut: false } });
    }
  });

  it('message and scan logs older than 90 days are deleted; newer ones stay', async () => {
    await scan('CARD-1A-01');
    await processScan(NORTH, { credentialUid: 'CARD-1A-02', eventId: 'retention-test' });
    const old = new Date(at('07:55').getTime() - 91 * 24 * 60 * 60_000);
    await prisma.notification.updateMany({ data: { createdAt: old } });
    expect(await purgeOldLogs(at('08:00'))).toEqual({ messages: 2, scans: 0 });
    await prisma.scanEvent.updateMany({ where: { eventId: 'retention-test' }, data: { createdAt: old } });
    expect(await purgeOldLogs(at('08:00'))).toEqual({ messages: 0, scans: 1 });
    expect(await prisma.attendanceRecord.count()).toBe(2);
  });
});

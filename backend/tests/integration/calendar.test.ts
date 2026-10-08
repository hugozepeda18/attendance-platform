import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { evaluateAbsences } from '../../src/services/attendance.service';
import { auth, KEYS, NORTH, setMexicoCityTime, signIn } from '../helpers';

// Phase 18: no absences and no messages on days without classes. Clock: Tue 2026-10-06 (Mexico City).
let principal: string;
let staff: string;
let southPrincipal: string;
let studentId: string;

const notifier = (sent: string[]) => ({
  sendScanAlert: async () => {},
  sendAbsenceAlert: async (p: { studentName: string }) => void sent.push(p.studentName),
});
const addDay = (body: object, token = principal) => request(app).post('/api/v1/calendar/days').set(auth(token)).send(body);
// 08:30 Mexico City on a given date (the absence cutoff of the seeded school)
const cutoffOn = (ymd: string) => jest.setSystemTime(new Date(`${ymd}T14:30:00Z`));

beforeAll(async () => {
  [principal, staff, southPrincipal] = await Promise.all([
    signIn('norte', 'principal@norte.test'),
    signIn('norte', 'staff@norte.test'),
    signIn('sur', 'principal@sur.test'),
  ]);
  studentId = (await prisma.student.findFirstOrThrow({ where: { schoolId: NORTH, credentialUid: 'CARD-1A-01' } })).id;
});

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
  await prisma.schoolCalendarDay.deleteMany({});
  setMexicoCityTime('07:30');
});

afterAll(async () => {
  await prisma.attendanceRecord.deleteMany({});
  await prisma.schoolCalendarDay.deleteMany({});
  await prisma.$disconnect();
});

describe('School calendar (Phase 18)', () => {
  it('a SEP holiday: no ABSENT records and no messages', async () => {
    cutoffOn('2026-11-16'); // Revolución Mexicana (Monday)
    const sent: string[] = [];
    expect(await evaluateAbsences(NORTH, notifier(sent))).toBe(0);
    expect(sent).toEqual([]);
    expect(await prisma.attendanceRecord.count()).toBe(0);
  });

  it('a Consejo Técnico day and a vacation day are skipped too; a normal day still runs', async () => {
    for (const ymd of ['2026-10-30', '2026-12-22']) {
      cutoffOn(ymd);
      expect(await evaluateAbsences(NORTH, notifier([]))).toBe(0);
    }
    cutoffOn('2026-11-17');
    expect(await evaluateAbsences(NORTH, notifier([]))).toBe(30);
  });

  it("the school's own day off (suspensión) is skipped by the absence run and by excuses", async () => {
    const res = await addDay({ date: '2026-10-07', label: 'Suspensión por falta de agua' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ date: '2026-10-07', source: 'SCHOOL' });

    const excuse = await request(app).post('/api/v1/attendance/excuses').set(auth(staff))
      .send({ studentId, from: '2026-10-07', to: '2026-10-08', reason: 'Viaje' });
    expect(excuse.body.excused).toEqual(['2026-10-08']);

    await prisma.attendanceRecord.deleteMany({});
    cutoffOn('2026-10-07');
    const sent: string[] = [];
    expect(await evaluateAbsences(NORTH, notifier(sent))).toBe(0);
    expect(sent).toEqual([]);
  });

  it('excuses skip SEP days off: Fri 13 Nov (registro) → Tue 17 Nov only excuses the 17th', async () => {
    const res = await request(app).post('/api/v1/attendance/excuses').set(auth(staff))
      .send({ studentId, from: '2026-11-13', to: '2026-11-17', reason: 'Enfermedad' });
    expect(res.body.excused).toEqual(['2026-11-17']);
  });

  it('lists SEP and school days; rules for adding; only the principal changes it', async () => {
    await addDay({ date: '2026-10-21', label: 'Aniversario de la escuela' });
    const list = await request(app).get('/api/v1/calendar').set(auth(staff));
    expect(list.body).toMatchObject({ schoolYear: '2026-2027', start: '2026-08-31', end: '2027-07-09' });
    expect(list.body.days[0]).toMatchObject({ date: '2026-10-21', label: 'Aniversario de la escuela', source: 'SCHOOL' });
    expect(list.body.days[1]).toEqual({ date: '2026-10-30', label: 'Consejo Técnico Escolar', source: 'SEP' });
    expect(list.body.days.some((d: { label: string }) => d.label === 'Fin de semana')).toBe(false);

    expect((await addDay({ date: '2026-10-05', label: 'x' })).body.message).toMatch(/Past/);
    expect((await addDay({ date: '2026-11-16', label: 'x' })).body.message).toMatch(/Revolución/);
    expect((await addDay({ date: '2026-10-21', label: 'x' })).body.message).toMatch(/Aniversario/);
    expect((await addDay({ date: '2026-10-22', label: 'x' }, staff)).status).toBe(403);
  });

  it('isolation: another school cannot see or delete the day', async () => {
    const { body } = await addDay({ date: '2026-10-21', label: 'Aniversario' });
    const south = await request(app).get('/api/v1/calendar').set(auth(southPrincipal));
    expect(south.body.days.map((d: { date: string }) => d.date)).not.toContain('2026-10-21');
    expect((await request(app).delete(`/api/v1/calendar/days/${body.id}`).set(auth(southPrincipal))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/calendar/days/${body.id}`).set(auth(principal))).status).toBe(204);
  });

  it('group analytics say when today has no classes', async () => {
    cutoffOn('2026-10-30');
    const res = await request(app).get('/api/v1/attendance/analytics/group/1/A').set(auth(KEYS.northStaff)); // sessions expire across the clock jump
    expect(res.body.today.nonSchoolDay).toBe('Consejo Técnico Escolar');
  });
});

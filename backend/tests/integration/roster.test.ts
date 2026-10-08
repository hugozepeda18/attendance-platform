import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';
import { evaluateAbsences } from '../../src/services/attendance.service';
import { auth, KEYS, NORTH, setMexicoCityTime, signIn } from '../helpers';

// Phase 17: the principal manages the roster; withdrawn students drop out of everything.
let principal: string;
let staff: string;
let southPrincipal: string;

const newStudent = {
  firstName: 'Nuevo',
  lastName: 'Alumno',
  grade: 2,
  group: 'c',
  credentialUid: ' card-new-01 ',
  guardianName: 'Tutor Nuevo',
  guardianWhatsApp: '+523312345600',
};
const silent = { sendScanAlert: async () => {}, sendAbsenceAlert: async () => {} };

async function cleanup() {
  await prisma.attendanceRecord.deleteMany({});
  await prisma.student.deleteMany({ where: { firstName: 'Nuevo' } });
  await prisma.student.updateMany({ where: { active: false }, data: { active: true } });
  await prisma.student.updateMany({ where: { credentialUid: 'CARD-1A-01-OLD' }, data: { credentialUid: 'CARD-1A-01' } });
}

beforeAll(async () => {
  [principal, staff, southPrincipal] = await Promise.all([
    signIn('norte', 'principal@norte.test'),
    signIn('norte', 'staff@norte.test'),
    signIn('sur', 'principal@sur.test'),
  ]);
});
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const add = (body: object, token = principal) => request(app).post('/api/v1/students').set(auth(token)).send(body);
const patch = (id: string, body: object, token = principal) => request(app).patch(`/api/v1/students/${id}`).set(auth(token)).send(body);
const card = (uid: string) => prisma.student.findFirstOrThrow({ where: { schoolId: NORTH, credentialUid: uid } });

describe('Student roster (Phase 17)', () => {
  it('groups come from the data; a new group appears when a student is added', async () => {
    const before = await request(app).get('/api/v1/students/groups').set(auth(staff));
    expect(before.status).toBe(200);
    expect(before.body.groups).toHaveLength(6);
    expect(before.body.groups[0]).toEqual({ grade: 1, group: 'A', students: 5 });

    const res = await add(newStudent);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ group: 'C', credentialUid: 'card-new-01', active: true });

    const after = await request(app).get('/api/v1/students/groups').set(auth(staff));
    expect(after.body.groups).toContainEqual({ grade: 2, group: 'C', students: 1 });
  });

  it('one badge per student, case-insensitive; staff cannot change the roster', async () => {
    const taken = await add({ ...newStudent, credentialUid: 'card-1a-01' });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe('BADGE_TAKEN');
    expect((await add(newStudent, staff)).status).toBe(403);
    expect((await request(app).get('/api/v1/students').set(auth(staff))).status).toBe(403);
    expect((await add({ ...newStudent, grade: 4 })).status).toBe(400); // secundaria: grades 1-3
    expect((await add({ ...newStudent, guardianWhatsApp: '3312345600' })).status).toBe(400);
  });

  it('a withdrawn student is not marked absent, cannot scan and leaves the lists and the gate roster', async () => {
    const student = await card('CARD-1A-01');
    expect((await patch(student.id, { active: false })).body.active).toBe(false);

    setMexicoCityTime('07:50');
    expect((await request(app).post('/api/v1/attendance/scan').set(auth(KEYS.northScanner)).send({ credentialUid: 'CARD-1A-01' })).status).toBe(404);

    const gate = await request(app).get('/api/v1/gate/roster').set(auth(KEYS.northScanner));
    expect(gate.body.students.map((s: { credentialUid: string }) => s.credentialUid)).not.toContain('CARD-1A-01');

    const group = await request(app).get('/api/v1/attendance/analytics/group/1/A').set(auth(staff));
    expect(group.body.today.total).toBe(4);

    setMexicoCityTime('08:30');
    expect(await evaluateAbsences(NORTH, silent)).toBe(29);
    expect(await prisma.attendanceRecord.count({ where: { studentId: student.id } })).toBe(0);

    // still listed for the principal, so they can bring the student back
    const all = await request(app).get('/api/v1/students?grade=1&group=a').set(auth(principal));
    expect(all.body.students).toHaveLength(5);
  });

  it('a withdrawn student keeps the badge until given another one', async () => {
    const old = await card('CARD-1A-01');
    await patch(old.id, { active: false });
    expect((await add({ ...newStudent, credentialUid: 'CARD-1A-01' })).status).toBe(409);
    expect((await patch(old.id, { credentialUid: 'CARD-1A-01-OLD' })).status).toBe(200);
    expect((await add({ ...newStudent, credentialUid: 'CARD-1A-01' })).status).toBe(201);
  });

  it('isolation: another school cannot see or edit the student', async () => {
    const student = await card('CARD-1A-01');
    expect((await patch(student.id, { firstName: 'X' }, southPrincipal)).status).toBe(404);
    const south = await request(app).get('/api/v1/students').set(auth(southPrincipal));
    expect(south.body.students.map((s: { id: string }) => s.id)).not.toContain(student.id);
    expect((await card('CARD-1A-01')).firstName).toBe(student.firstName);
  });
});

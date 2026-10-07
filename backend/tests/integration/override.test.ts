import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.attendanceRecord.deleteMany({});
});

async function createRecord() {
  await request(app).post('/api/v1/attendance/scan').send({ credentialUid: 'CARD-1A-01' });
  const student = await prisma.student.findFirst({ where: { credentialUid: 'CARD-1A-01' } });
  return prisma.attendanceRecord.findFirst({ where: { studentId: student!.id } });
}

describe('PATCH /api/v1/attendance/record/:id', () => {
  it('returns 403 when x-user-role header is missing', async () => {
    const record = await createRecord();
    const res = await request(app)
      .patch(`/api/v1/attendance/record/${record!.id}`)
      .send({ status: 'EXCUSED' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 403 when x-user-role is not PRINCIPAL', async () => {
    const record = await createRecord();
    const res = await request(app)
      .patch(`/api/v1/attendance/record/${record!.id}`)
      .set('x-user-role', 'TEACHER')
      .send({ status: 'EXCUSED' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('updates status to EXCUSED with a note when PRINCIPAL header is present', async () => {
    const record = await createRecord();
    const res = await request(app)
      .patch(`/api/v1/attendance/record/${record!.id}`)
      .set('x-user-role', 'PRINCIPAL')
      .send({ status: 'EXCUSED', note: 'Medical certificate provided' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('EXCUSED');
    expect(res.body.note).toBe('Medical certificate provided');
    expect(res.body.updatedByRole).toBe('PRINCIPAL');
  });

  it('updates status without a note', async () => {
    const record = await createRecord();
    const res = await request(app)
      .patch(`/api/v1/attendance/record/${record!.id}`)
      .set('x-user-role', 'PRINCIPAL')
      .send({ status: 'ABSENT' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ABSENT');
    expect(res.body.updatedByRole).toBe('PRINCIPAL');
  });

  it('returns 400 for an invalid status value', async () => {
    const record = await createRecord();
    const res = await request(app)
      .patch(`/api/v1/attendance/record/${record!.id}`)
      .set('x-user-role', 'PRINCIPAL')
      .send({ status: 'INVALID_STATUS' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_INPUT');
  });

  it('returns 404 for a non-existent record ID', async () => {
    const res = await request(app)
      .patch('/api/v1/attendance/record/00000000-0000-0000-0000-000000000000')
      .set('x-user-role', 'PRINCIPAL')
      .send({ status: 'EXCUSED' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

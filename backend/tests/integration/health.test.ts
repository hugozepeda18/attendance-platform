import request from 'supertest';
import app from '../../src/index';
import prisma from '../../src/lib/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /health', () => {
  it('returns 200 with status ok and db connected', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

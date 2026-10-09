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

describe('GET /internal/tls-check (Caddy on-demand TLS)', () => {
  const check = (domain: string) => request(app).get(`/internal/tls-check?domain=${domain}`);
  beforeAll(() => { process.env.PLATFORM_DOMAIN = 'asistencia.mx'; });
  afterAll(() => { delete process.env.PLATFORM_DOMAIN; });

  it('allows existing schools, admin and api; refuses anything else', async () => {
    for (const d of ['norte.asistencia.mx', 'admin.asistencia.mx', 'API.asistencia.mx']) expect((await check(d)).status).toBe(200);
    for (const d of ['nope.asistencia.mx', 'asistencia.mx', 'norte.evil.mx', 'x.norte.asistencia.mx']) expect((await check(d)).status).toBe(404);
  });
});

describe('Hardening', () => {
  it('no x-powered-by header; bodies over 256 kB are refused', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    const big = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ pad: 'x'.repeat(300_000) }));
    expect(big.status).toBe(413);
  });
});

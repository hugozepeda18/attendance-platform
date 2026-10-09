import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { findSchoolBySlug } from '../repositories/school.repository';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

// Caddy asks this before getting a TLS certificate for a new hostname (on-demand TLS), so only
// <school>.<PLATFORM_DOMAIN>, admin. and api. get one. Not reachable from outside: Caddy only proxies /api/*.
router.get('/internal/tls-check', async (req: Request, res: Response) => {
  const domain = String(req.query.domain ?? '').toLowerCase();
  const base = (process.env.PLATFORM_DOMAIN ?? '').toLowerCase();
  const sub = base && domain.endsWith(`.${base}`) ? domain.slice(0, -base.length - 1) : null;
  const ok = sub !== null && (sub === 'admin' || sub === 'api' || !!(await findSchoolBySlug(sub)));
  res.sendStatus(ok ? 200 : 404);
});

export default router;

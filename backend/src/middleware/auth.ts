import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { resolveBearerToken, AuthContext } from '../services/auth.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function deny(res: Response, status: number, error: string, message: string): void {
  res.status(status).json({ error, message });
}

// Resolves `Authorization: Bearer <token>` into req.auth. Any client-sent role header is ignored.
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return deny(res, 401, 'UNAUTHENTICATED', 'Missing bearer token');

  try {
    const result = await resolveBearerToken(token, req.headers['x-school-id']);
    if (!result.ok) return deny(res, result.status, result.error, result.message);
    req.auth = result.auth;
    next();
  } catch (err) {
    console.error('[authenticate]', err);
    deny(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

// SUPERADMIN always passes so the platform owner can support any tenant.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.auth?.role;
    if (role === 'SUPERADMIN' || (role && roles.includes(role))) return next();
    deny(res, 403, 'FORBIDDEN', `This action requires role: ${roles.join(' or ')}`);
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.role === 'SUPERADMIN' && !req.auth.support) return next();
  deny(res, 403, 'FORBIDDEN', 'This action requires the platform super-admin');
}

// Tenant routes need a school context: from the key itself, or `x-school-id` for the super-admin.
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.schoolId) return next();
  deny(res, 400, 'SCHOOL_REQUIRED', 'Super-admin must send x-school-id to act on a school');
}

export function schoolIdOf(req: Request): string {
  return req.auth!.schoolId!;
}

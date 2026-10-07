import { Role } from '@prisma/client';
import { hashToken, safeEqual } from '../lib/tokens';
import { findApiKeyByHash, findSchoolById } from '../repositories/school.repository';

export interface AuthContext {
  role: Role | 'SUPERADMIN';
  schoolId: string | null; // null = super-admin without a selected school
}

type ResolveResult =
  | { ok: true; auth: AuthContext }
  | { ok: false; status: number; error: string; message: string };

const invalid: ResolveResult = { ok: false, status: 401, error: 'UNAUTHENTICATED', message: 'Invalid or revoked token' };

export async function resolveBearerToken(
  token: string,
  schoolIdHeader: string | string[] | undefined,
): Promise<ResolveResult> {
  const superKey = process.env.SUPERADMIN_API_KEY;
  if (superKey && safeEqual(token, superKey)) {
    const schoolId = typeof schoolIdHeader === 'string' ? schoolIdHeader : null;
    if (schoolId && !(await findSchoolById(schoolId))) {
      return { ok: false, status: 404, error: 'SCHOOL_NOT_FOUND', message: 'x-school-id does not match a school' };
    }
    return { ok: true, auth: { role: 'SUPERADMIN', schoolId } };
  }

  const key = await findApiKeyByHash(hashToken(token));
  if (!key || key.revokedAt) return invalid;
  if (!key.school.active) {
    return { ok: false, status: 403, error: 'SCHOOL_INACTIVE', message: 'This school account is deactivated' };
  }
  return { ok: true, auth: { role: key.role, schoolId: key.schoolId } };
}

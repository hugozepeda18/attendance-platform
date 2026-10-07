import { Role } from '@prisma/client';
import { generateToken, hashPassword, hashToken, safeEqual, verifyPassword } from '../lib/tokens';
import { findApiKeyByHash, findSchoolById } from '../repositories/school.repository';
import {
  createSession,
  findSessionByHash,
  findUserForLogin,
  revokeSession,
} from '../repositories/user.repository';

export interface AuthContext {
  role: Role | 'SUPERADMIN';
  schoolId: string | null; // null = super-admin without a selected school
  userId?: string; // set for signed-in people (sessions), absent for API keys
  sessionId?: string;
}

type ResolveResult =
  | { ok: true; auth: AuthContext }
  | { ok: false; status: number; error: string; message: string };

const invalid: ResolveResult = { ok: false, status: 401, error: 'UNAUTHENTICATED', message: 'Invalid or revoked token' };
const inactive: ResolveResult = { ok: false, status: 403, error: 'SCHOOL_INACTIVE', message: 'This school account is deactivated' };

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

  if (token.startsWith('st_')) {
    const session = await findSessionByHash(hashToken(token));
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) return invalid;
    if (!session.user.school.active) return inactive;
    const { user } = session;
    return { ok: true, auth: { role: user.role, schoolId: user.schoolId, userId: user.id, sessionId: session.id } };
  }

  const key = await findApiKeyByHash(hashToken(token));
  if (!key || key.revokedAt) return invalid;
  if (!key.school.active) return inactive;
  return { ok: true, auth: { role: key.role, schoolId: key.schoolId } };
}

// ─── Login throttle ──────────────────────────────────────────────────────────
// ponytail: in-memory, per process. Move to Postgres/Redis if running more than one backend instance.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function isThrottled(key: string): boolean {
  const entry = failures.get(key);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || entry.resetAt < Date.now()) failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  else entry.count++;
}

// Compared against when the email doesn't exist, so response time doesn't reveal valid emails.
const dummyHash = hashPassword('timing-equalizer');

export class LoginThrottledError extends Error {}
export class SchoolInactiveError extends Error {}

export async function login(schoolSlug: string, email: string, password: string) {
  const throttleKey = `${schoolSlug}:${email}`;
  if (isThrottled(throttleKey)) throw new LoginThrottledError();

  const user = await findUserForLogin(schoolSlug, email);
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid || !user.active) {
    recordFailure(throttleKey);
    return null;
  }
  if (!user.school.active) throw new SchoolInactiveError();

  failures.delete(throttleKey);
  const token = generateToken('st');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await createSession({ userId: user.id, tokenHash: hashToken(token), expiresAt });

  return {
    token,
    expiresAt,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    school: { id: user.school.id, name: user.school.name },
  };
}

export async function logout(auth: AuthContext): Promise<void> {
  if (auth.sessionId) await revokeSession(auth.sessionId);
}

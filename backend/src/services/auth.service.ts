import { Role } from '@prisma/client';
import { generateToken, hashPassword, hashToken, safeEqual, verifyPassword } from '../lib/tokens';
import { findApiKeyByHash, findSchoolById, touchApiKey } from '../repositories/school.repository';
import {
  createSession,
  findAdminByEmail,
  findSessionByHash,
  findUserForLogin,
  revokeSession,
} from '../repositories/user.repository';

export interface AuthContext {
  role: Role | 'SUPERADMIN';
  schoolId: string | null; // null = super-admin without a selected school
  userId?: string; // set for signed-in school users, absent for API keys
  adminId?: string; // set for signed-in platform admins
  apiKeyId?: string; // set for API keys (scanners, integrations)
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
  // Super-admin may act inside one school by naming it in x-school-id.
  async function superAdmin(extra: Partial<AuthContext>): Promise<ResolveResult> {
    const schoolId = typeof schoolIdHeader === 'string' ? schoolIdHeader : null;
    if (schoolId && !(await findSchoolById(schoolId))) {
      return { ok: false, status: 404, error: 'SCHOOL_NOT_FOUND', message: 'x-school-id does not match a school' };
    }
    return { ok: true, auth: { role: 'SUPERADMIN', schoolId, ...extra } };
  }

  // Emergency/scripting fallback; day-to-day the owner signs in with a PlatformAdmin account.
  const superKey = process.env.SUPERADMIN_API_KEY;
  if (superKey && safeEqual(token, superKey)) return superAdmin({});

  if (token.startsWith('st_')) {
    const session = await findSessionByHash(hashToken(token));
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return invalid;
    if (session.admin) {
      if (!session.admin.active) return invalid;
      return superAdmin({ adminId: session.admin.id, sessionId: session.id });
    }
    const { user } = session;
    if (!user || !user.active) return invalid;
    if (!user.school.active) return inactive;
    return { ok: true, auth: { role: user.role, schoolId: user.schoolId, userId: user.id, sessionId: session.id } };
  }

  const key = await findApiKeyByHash(hashToken(token));
  if (!key || key.revokedAt) return invalid;
  if (!key.school.active) return inactive;
  // Scanner health; written at most once a minute per key.
  if (!key.lastSeenAt || Date.now() - key.lastSeenAt.getTime() > 60_000) await touchApiKey(key.id);
  return { ok: true, auth: { role: key.role, schoolId: key.schoolId, apiKeyId: key.id } };
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

// Platform owner login (admin.<domain>). Same throttle and timing protections as school login.
export async function adminLogin(email: string, password: string) {
  const throttleKey = `admin:${email}`;
  if (isThrottled(throttleKey)) throw new LoginThrottledError();

  const admin = await findAdminByEmail(email);
  const valid = await verifyPassword(password, admin?.passwordHash ?? (await dummyHash));
  if (!admin || !valid || !admin.active) {
    recordFailure(throttleKey);
    return null;
  }

  failures.delete(throttleKey);
  const token = generateToken('st');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await createSession({ adminId: admin.id, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt, admin: { id: admin.id, name: admin.name, email: admin.email } };
}

export async function logout(auth: AuthContext): Promise<void> {
  if (auth.sessionId) await revokeSession(auth.sessionId);
}

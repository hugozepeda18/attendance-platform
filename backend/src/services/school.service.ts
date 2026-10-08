import { Prisma, Role } from '@prisma/client';
import { generateToken, hashPassword, hashToken } from '../lib/tokens';
import {
  createApiKey,
  ConfigFields,
  createSchoolWithConfig,
  findSchoolById,
  findSchoolDetail,
  listApiKeys,
  listSchools,
  revokeApiKey,
  updateSchool,
} from '../repositories/school.repository';

export class SlugTakenError extends Error {}

function rethrowSlugConflict(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new SlugTakenError();
  throw err;
}

const STARTER_ROLES: Role[] = ['SCANNER', 'STAFF', 'PRINCIPAL'];

export async function onboardSchool(input: {
  name: string;
  slug: string;
  schoolStartTime: string;
  tardyGraceMinutes: number;
  absenceCutoffMinutes: number;
  timezone: string;
  principalWhatsApp?: string;
  principal?: { email: string; name: string; password: string };
}) {
  const keys = STARTER_ROLES.map((role) => ({ role, label: `initial ${role.toLowerCase()}`, plain: generateToken('ak') }));
  const { name, slug, principal, ...config } = input;

  const school = await createSchoolWithConfig({
    name,
    slug,
    config,
    principal: principal && {
      email: principal.email,
      name: principal.name,
      passwordHash: await hashPassword(principal.password),
    },
    keys: keys.map(({ role, label, plain }) => ({ role, label, keyHash: hashToken(plain) })),
  }).catch(rethrowSlugConflict);

  // Plaintext keys are returned exactly once; only hashes are stored.
  return { school, apiKeys: keys.map(({ role, plain }) => ({ role, key: plain })) };
}

export async function getSchools() {
  const schools = await listSchools();
  return schools.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    active: s.active,
    createdAt: s.createdAt,
    timezone: s.config?.timezone ?? null,
    studentCount: s._count.students,
  }));
}

export async function getSchoolDetail(id: string) {
  const s = await findSchoolDetail(id);
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    active: s.active,
    createdAt: s.createdAt,
    config: s.config,
    studentCount: s._count.students,
    userCount: s._count.users,
    activeKeyCount: s._count.apiKeys,
  };
}

export async function editSchool(
  id: string,
  data: { active?: boolean; slug?: string; name?: string; config?: Partial<ConfigFields> },
) {
  if (!(await findSchoolById(id))) return null;
  return updateSchool(id, data).catch(rethrowSlugConflict);
}

export async function issueApiKey(schoolId: string, role: Role, label: string) {
  if (!(await findSchoolById(schoolId))) return null;
  const plain = generateToken('ak');
  const key = await createApiKey({ schoolId, role, label, keyHash: hashToken(plain) });
  return { id: key.id, role: key.role, label: key.label, key: plain };
}

export async function getApiKeys(schoolId: string) {
  if (!(await findSchoolById(schoolId))) return null;
  return listApiKeys(schoolId);
}

export async function revokeKey(schoolId: string, keyId: string): Promise<boolean> {
  const { count } = await revokeApiKey(schoolId, keyId);
  return count > 0;
}

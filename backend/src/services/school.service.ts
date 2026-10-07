import { Role } from '@prisma/client';
import { generateToken, hashToken } from '../lib/tokens';
import {
  createApiKey,
  createSchoolWithConfig,
  findSchoolById,
  listApiKeys,
  listSchools,
  revokeApiKey,
  setSchoolActive,
} from '../repositories/school.repository';

const STARTER_ROLES: Role[] = ['SCANNER', 'STAFF', 'PRINCIPAL'];

export async function onboardSchool(input: {
  name: string;
  schoolStartTime: string;
  tardyGraceMinutes: number;
  absenceCutoffMinutes: number;
  timezone: string;
}) {
  const keys = STARTER_ROLES.map((role) => ({ role, label: `initial ${role.toLowerCase()}`, plain: generateToken('ak') }));
  const { name, ...config } = input;

  const school = await createSchoolWithConfig({
    name,
    config,
    keys: keys.map(({ role, label, plain }) => ({ role, label, keyHash: hashToken(plain) })),
  });

  // Plaintext keys are returned exactly once; only hashes are stored.
  return { school, apiKeys: keys.map(({ role, plain }) => ({ role, key: plain })) };
}

export async function getSchools() {
  const schools = await listSchools();
  return schools.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    createdAt: s.createdAt,
    timezone: s.config?.timezone ?? null,
    studentCount: s._count.students,
  }));
}

export async function updateSchoolStatus(id: string, active: boolean) {
  if (!(await findSchoolById(id))) return null;
  return setSchoolActive(id, active);
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

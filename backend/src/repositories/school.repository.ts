import { Role } from '@prisma/client';
import prisma from '../lib/prisma';

export async function findApiKeyByHash(keyHash: string) {
  return prisma.apiKey.findUnique({ where: { keyHash }, include: { school: true } });
}

export async function findSchoolById(id: string) {
  return prisma.school.findUnique({ where: { id } });
}

export async function listSchools() {
  return prisma.school.findMany({
    orderBy: { createdAt: 'asc' },
    include: { config: true, _count: { select: { students: true } } },
  });
}

export async function listActiveSchoolConfigs() {
  return prisma.schoolConfig.findMany({ where: { school: { active: true } } });
}

export type ConfigFields = {
  schoolStartTime: string;
  tardyGraceMinutes: number;
  absenceCutoffMinutes: number;
  timezone: string;
  dropLeadingZeros?: boolean;
};

// School, config, keys and optional first principal are written in one statement: all or nothing.
export async function createSchoolWithConfig(data: {
  name: string;
  slug: string;
  config: ConfigFields;
  keys: { role: Role; label: string; keyHash: string }[];
  principal?: { email: string; name: string; passwordHash: string };
}) {
  return prisma.school.create({
    data: {
      name: data.name,
      slug: data.slug,
      config: { create: data.config },
      apiKeys: { create: data.keys },
      ...(data.principal ? { users: { create: { ...data.principal, role: 'PRINCIPAL' } } } : {}),
    },
    include: { config: true },
  });
}

export async function findSchoolDetail(id: string) {
  return prisma.school.findUnique({
    where: { id },
    include: {
      config: true,
      _count: { select: { students: true, users: true, apiKeys: { where: { revokedAt: null } } } },
    },
  });
}

export async function createApiKey(data: { schoolId: string; role: Role; label: string; keyHash: string }) {
  return prisma.apiKey.create({ data });
}

export async function listApiKeys(schoolId: string) {
  return prisma.apiKey.findMany({
    where: { schoolId },
    select: { id: true, role: true, label: true, createdAt: true, revokedAt: true, lastSeenAt: true, pendingScans: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function revokeApiKey(schoolId: string, id: string) {
  return prisma.apiKey.updateMany({
    where: { id, schoolId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function findSchoolBySlug(slug: string) {
  return prisma.school.findUnique({ where: { slug } });
}

export async function updateSchool(
  id: string,
  data: { active?: boolean; slug?: string; name?: string; config?: Partial<ConfigFields> },
) {
  const { config, ...school } = data;
  return prisma.school.update({
    where: { id },
    data: { ...school, ...(config && Object.keys(config).length ? { config: { update: config } } : {}) },
    include: { config: true },
  });
}

export async function touchApiKey(id: string) {
  return prisma.apiKey.update({ where: { id }, data: { lastSeenAt: new Date() } });
}

export async function recordHeartbeat(id: string, pendingScans: number) {
  return prisma.apiKey.update({ where: { id }, data: { lastSeenAt: new Date(), pendingScans } });
}

// Active scanner keys of a school that have talked to the server since `since`.
export async function findRecentScannerKeys(schoolId: string, since: Date) {
  return prisma.apiKey.findMany({
    where: { schoolId, role: 'SCANNER', revokedAt: null, lastSeenAt: { gte: since } },
    select: { id: true, label: true, lastSeenAt: true, pendingScans: true },
  });
}

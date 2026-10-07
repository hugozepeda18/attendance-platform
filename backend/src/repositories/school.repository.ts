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

export async function createSchoolWithConfig(data: {
  name: string;
  slug: string;
  config: { schoolStartTime: string; tardyGraceMinutes: number; absenceCutoffMinutes: number; timezone: string };
  keys: { role: Role; label: string; keyHash: string }[];
}) {
  return prisma.school.create({
    data: {
      name: data.name,
      slug: data.slug,
      config: { create: data.config },
      apiKeys: { create: data.keys },
    },
    include: { config: true },
  });
}

export async function createApiKey(data: { schoolId: string; role: Role; label: string; keyHash: string }) {
  return prisma.apiKey.create({ data });
}

export async function listApiKeys(schoolId: string) {
  return prisma.apiKey.findMany({
    where: { schoolId },
    select: { id: true, role: true, label: true, createdAt: true, revokedAt: true },
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

export async function updateSchool(id: string, data: { active?: boolean; slug?: string }) {
  return prisma.school.update({ where: { id }, data });
}

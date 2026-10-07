import { Role } from '@prisma/client';
import prisma from '../lib/prisma';

const publicUser = { id: true, email: true, name: true, role: true, active: true, createdAt: true } as const;

export async function findUserForLogin(schoolSlug: string, email: string) {
  return prisma.user.findFirst({
    where: { email, school: { slug: schoolSlug } },
    include: { school: true },
  });
}

export async function findUserInSchool(schoolId: string, id: string) {
  return prisma.user.findFirst({ where: { id, schoolId } });
}

export async function listUsers(schoolId: string) {
  return prisma.user.findMany({ where: { schoolId }, select: publicUser, orderBy: { name: 'asc' } });
}

export async function createUser(data: { schoolId: string; email: string; name: string; role: Role; passwordHash: string }) {
  return prisma.user.create({ data, select: publicUser });
}

export async function updateUser(
  id: string,
  data: { name?: string; role?: Role; active?: boolean; passwordHash?: string },
) {
  return prisma.user.update({ where: { id }, data, select: publicUser });
}

export async function createSession(data: { userId?: string; adminId?: string; tokenHash: string; expiresAt: Date }) {
  return prisma.session.create({ data });
}

export async function findSessionByHash(tokenHash: string) {
  return prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { school: true } }, admin: true },
  });
}

export async function findAdminByEmail(email: string) {
  return prisma.platformAdmin.findUnique({ where: { email } });
}

export async function findAdminById(id: string) {
  return prisma.platformAdmin.findUnique({ where: { id } });
}

export async function revokeSession(id: string) {
  return prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function revokeUserSessions(userId: string) {
  return prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

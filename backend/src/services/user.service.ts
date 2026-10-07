import { Prisma, Role } from '@prisma/client';
import { hashPassword } from '../lib/tokens';
import { AuthContext } from './auth.service';
import {
  createUser,
  findUserInSchool,
  listUsers,
  revokeUserSessions,
  updateUser,
} from '../repositories/user.repository';

export class EmailTakenError extends Error {}
export class SelfLockoutError extends Error {}

export async function getUsers(schoolId: string) {
  return listUsers(schoolId);
}

export async function addUser(
  schoolId: string,
  input: { email: string; name: string; role: Role; password: string },
) {
  try {
    return await createUser({
      schoolId,
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new EmailTakenError();
    throw err;
  }
}

export async function editUser(
  auth: AuthContext,
  id: string,
  input: { name?: string; role?: Role; active?: boolean; password?: string },
) {
  const user = await findUserInSchool(auth.schoolId!, id);
  if (!user) return null;

  // A principal must not lock themselves out (deactivate or demote their own account).
  if (auth.userId === id && (input.active === false || (input.role && input.role !== user.role))) {
    throw new SelfLockoutError();
  }

  const { password, ...rest } = input;
  const updated = await updateUser(id, {
    ...rest,
    ...(password ? { passwordHash: await hashPassword(password) } : {}),
  });

  // Deactivation, role change or password reset ends existing sessions immediately.
  if (input.active === false || input.role || password) await revokeUserSessions(id);
  return updated;
}

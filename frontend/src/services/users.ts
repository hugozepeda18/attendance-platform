import api from './api';
import type { SchoolUser, PersonRole } from '../types';

// schoolId is only passed by the platform admin dashboard (super-admin acting on a school).
const scope = (schoolId?: string) => (schoolId ? { headers: { 'x-school-id': schoolId } } : {});

export async function listUsers(schoolId?: string): Promise<SchoolUser[]> {
  const { data } = await api.get<{ users: SchoolUser[] }>('/api/v1/users', scope(schoolId));
  return data.users;
}

export async function createUser(
  input: { email: string; name: string; role: PersonRole; password: string },
  schoolId?: string,
): Promise<void> {
  await api.post('/api/v1/users', input, scope(schoolId));
}

export async function updateUser(
  id: string,
  input: { active?: boolean; password?: string; role?: PersonRole },
  schoolId?: string,
): Promise<void> {
  await api.patch(`/api/v1/users/${id}`, input, scope(schoolId));
}

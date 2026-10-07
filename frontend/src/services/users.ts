import api from './api';
import type { SchoolUser, PersonRole } from '../types';

export async function listUsers(): Promise<SchoolUser[]> {
  const { data } = await api.get<{ users: SchoolUser[] }>('/api/v1/users');
  return data.users;
}

export async function createUser(input: { email: string; name: string; role: PersonRole; password: string }): Promise<void> {
  await api.post('/api/v1/users', input);
}

export async function updateUser(
  id: string,
  input: { active?: boolean; password?: string; role?: PersonRole },
): Promise<void> {
  await api.patch(`/api/v1/users/${id}`, input);
}

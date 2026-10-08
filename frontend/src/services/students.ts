import api from './api';
import type { GroupInfo, RosterStudent } from '../types';

export type StudentInput = Omit<RosterStudent, 'id' | 'active'>;

export async function listGroups(): Promise<GroupInfo[]> {
  const { data } = await api.get<{ groups: GroupInfo[] }>('/api/v1/students/groups');
  return data.groups;
}

export async function listStudents(grade?: number, group?: string): Promise<RosterStudent[]> {
  const { data } = await api.get<{ students: RosterStudent[] }>('/api/v1/students', { params: { grade, group } });
  return data.students;
}

export async function createStudent(input: StudentInput): Promise<void> {
  await api.post('/api/v1/students', input);
}

export async function updateStudent(id: string, input: Partial<StudentInput> & { active?: boolean }): Promise<void> {
  await api.patch(`/api/v1/students/${id}`, input);
}

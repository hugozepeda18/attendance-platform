import api from './api';
import type { ApiKeyInfo, SchoolConfig, SchoolDetail, SchoolSummary } from '../types';

export async function listSchools(): Promise<SchoolSummary[]> {
  const { data } = await api.get<{ schools: SchoolSummary[] }>('/api/v1/admin/schools');
  return data.schools;
}

export async function getSchool(id: string): Promise<SchoolDetail> {
  const { data } = await api.get<SchoolDetail>(`/api/v1/admin/schools/${id}`);
  return data;
}

export interface NewSchoolInput extends SchoolConfig {
  name: string;
  slug: string;
  principal: { email: string; name: string; password: string };
}

export async function createSchool(
  input: NewSchoolInput,
): Promise<{ school: { id: string; slug: string; name: string }; apiKeys: { role: string; key: string }[] }> {
  const { data } = await api.post('/api/v1/admin/schools', input);
  return data;
}

export async function updateSchool(
  id: string,
  input: Partial<SchoolConfig> & { name?: string; slug?: string; active?: boolean },
): Promise<void> {
  await api.patch(`/api/v1/admin/schools/${id}`, input);
}

export async function listKeys(schoolId: string): Promise<ApiKeyInfo[]> {
  const { data } = await api.get<{ keys: ApiKeyInfo[] }>(`/api/v1/admin/schools/${schoolId}/keys`);
  return data.keys;
}

export async function issueKey(schoolId: string, role: ApiKeyInfo['role'], label: string): Promise<string> {
  const { data } = await api.post<{ key: string }>(`/api/v1/admin/schools/${schoolId}/keys`, { role, label });
  return data.key;
}

export async function revokeKey(schoolId: string, keyId: string): Promise<void> {
  await api.delete(`/api/v1/admin/schools/${schoolId}/keys/${keyId}`);
}

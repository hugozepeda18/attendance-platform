import api from './api';
import { schoolUrl } from './school';
import type { ApiKeyInfo, SchoolConfig, SchoolDetail, SchoolSummary } from '../types';

// sepCalendarUntil: last day covered by the SEP calendars loaded in the backend (src/calendar/sep.ts).
export async function listSchools(): Promise<{ schools: SchoolSummary[]; sepCalendarUntil: string }> {
  const { data } = await api.get<{ schools: SchoolSummary[]; sepCalendarUntil: string }>('/api/v1/admin/schools');
  return data;
}

export async function getSchool(id: string): Promise<SchoolDetail> {
  const { data } = await api.get<SchoolDetail>(`/api/v1/admin/schools/${id}`);
  return data;
}

export interface NewSchoolInput extends SchoolConfig {
  name: string;
  slug: string;
  principalWhatsApp?: string;
  principal: { email: string; name: string; password: string };
}

export async function slugAvailable(slug: string): Promise<{ available: boolean; reason?: string }> {
  const { data } = await api.get('/api/v1/admin/slug-available', { params: { slug } });
  return data;
}

// A 2-hour session locked to one school, opened in a new tab at the school's own address.
export async function openAsSupport(schoolId: string, slug: string): Promise<void> {
  const tab = window.open('', '_blank'); // before the await, so the popup isn't blocked
  try {
    const { data } = await api.post<{ token: string }>(`/api/v1/admin/schools/${schoolId}/support`);
    if (tab) {
      tab.opener = null;
      tab.location.href = `${schoolUrl(slug)}/#support=${data.token}`;
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
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

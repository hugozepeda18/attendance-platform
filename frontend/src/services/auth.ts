import api from './api';
import type { Me } from '../types';

export async function getMe(): Promise<Me> {
  const { data } = await api.get<Me>('/api/v1/me');
  return data;
}

export async function getPublicSchool(slug: string): Promise<{ name: string }> {
  const { data } = await api.get<{ name: string }>(`/api/v1/public/schools/${encodeURIComponent(slug)}`);
  return data;
}

export async function login(school: string, email: string, password: string): Promise<string> {
  const { data } = await api.post<{ token: string }>('/api/v1/auth/login', { school, email, password });
  return data.token;
}

export async function adminLogin(email: string, password: string): Promise<string> {
  const { data } = await api.post<{ token: string }>('/api/v1/auth/admin-login', { email, password });
  return data.token;
}

export async function logout(): Promise<void> {
  await api.post('/api/v1/auth/logout');
}

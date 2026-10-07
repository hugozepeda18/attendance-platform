import api from './api';
import type { Me } from '../types';

export async function getMe(): Promise<Me> {
  const { data } = await api.get<Me>('/api/v1/me');
  return data;
}

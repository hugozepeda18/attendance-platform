import api from './api';
import type { CalendarDay, SchoolCalendar } from '../types';

export async function getCalendar(): Promise<SchoolCalendar> {
  const { data } = await api.get<SchoolCalendar>('/api/v1/calendar');
  return data;
}

export async function addCalendarDay(date: string, label: string): Promise<CalendarDay> {
  const { data } = await api.post<CalendarDay>('/api/v1/calendar/days', { date, label });
  return data;
}

export async function deleteCalendarDay(id: string): Promise<void> {
  await api.delete(`/api/v1/calendar/days/${id}`);
}

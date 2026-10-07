import api from './api';
import type { StudentSearchResult, GroupAnalytics, StudentAnalytics, AttendanceStatus } from '../types';

export async function searchStudents(query: string): Promise<StudentSearchResult[]> {
  const { data } = await api.get<{ results: StudentSearchResult[] }>('/api/v1/attendance/search', {
    params: { query },
  });
  return data.results;
}

export async function getGroupAnalytics(grade: number, group: string): Promise<GroupAnalytics> {
  const { data } = await api.get<GroupAnalytics>(
    `/api/v1/attendance/analytics/group/${grade}/${group}`,
  );
  return data;
}

export async function getStudentAnalytics(studentId: string): Promise<StudentAnalytics> {
  const { data } = await api.get<StudentAnalytics>(
    `/api/v1/attendance/analytics/student/${studentId}`,
  );
  return data;
}

export async function patchRecord(
  recordId: string,
  status: AttendanceStatus,
  note: string,
): Promise<void> {
  await api.patch(`/api/v1/attendance/record/${recordId}`, { status, note });
}

export async function excuseInAdvance(input: {
  studentId: string;
  from: string;
  to?: string;
  reason: string;
}): Promise<{ excused: string[]; skipped: string[] }> {
  const { data } = await api.post('/api/v1/attendance/excuses', input);
  return data;
}

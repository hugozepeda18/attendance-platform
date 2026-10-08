import api from './api';
import type { StudentSearchResult, GroupAnalytics, StudentAnalytics, AttendanceStatus, ChangeRequest, RequestState } from '../types';

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

export async function excuseInAdvance(input: {
  studentId: string;
  from: string;
  to?: string;
  reason: string;
}): Promise<{ excused: string[]; skipped: string[] }> {
  const { data } = await api.post('/api/v1/attendance/excuses', input);
  return data;
}

// Staff: creates a request for the principal (applied: false). Principal: applied right away.
export async function requestChange(input: {
  studentId: string;
  date: string;
  status: AttendanceStatus;
  reason: string;
}): Promise<{ applied: boolean }> {
  const { data } = await api.post('/api/v1/attendance/changes', input);
  return data;
}

export async function listChangeRequests(state?: RequestState): Promise<{ requests: ChangeRequest[]; pending?: number }> {
  const { data } = await api.get('/api/v1/attendance/changes', { params: { state } });
  return data;
}

export async function decideChangeRequest(id: string, approve: boolean): Promise<void> {
  await api.post(`/api/v1/attendance/changes/${id}/${approve ? 'approve' : 'reject'}`);
}

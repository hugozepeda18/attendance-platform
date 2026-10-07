import { AttendanceStatus, UpdatedByRole } from '@prisma/client';
import { AuthContext } from './auth.service';
import { z } from 'zod';
import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import { findStudentsByGradeAndGroup, findStudentById } from '../repositories/student.repository';
import {
  findRecordsByStudentIdsAndDate,
  findRecordsByStudentIdsAndDateRange,
  findRecordsByStudentAndDateRange,
  findRecordById,
  updateAttendanceRecord,
} from '../repositories/attendance.repository';
import { getDateInTimezone } from './attendance.service';

export const OverrideSchema = z.object({
  status: z.enum(['PRESENT', 'TARDY', 'ABSENT', 'EXCUSED']),
  note: z.string().optional(),
});

function dateRange(timezone: string): { today: Date; thirtyDaysAgo: Date } {
  const today = getDateInTimezone(timezone);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  return { today, thirtyDaysAgo };
}

function riskFlags(tardy30: number, absent30: number) {
  return {
    isHabituallyTardy: tardy30 >= 3,
    isChronicAbsentee: absent30 >= 3,
  };
}

export async function getGroupAnalytics(schoolId: string, grade: number, group: string) {
  const config = await getSchoolConfig(schoolId);
  const timezone = config?.timezone ?? 'America/Mexico_City';

  const students = await findStudentsByGradeAndGroup(schoolId, grade, group);
  if (students.length === 0) return null;

  const { today, thirtyDaysAgo } = dateRange(timezone);
  const studentIds = students.map((s) => s.id);

  const [todayRecords, rangeRecords] = await Promise.all([
    findRecordsByStudentIdsAndDate(studentIds, today),
    findRecordsByStudentIdsAndDateRange(studentIds, thirtyDaysAgo, today),
  ]);

  const todaySummary = {
    total: students.length,
    present: todayRecords.filter((r) => r.status === 'PRESENT').length,
    tardy: todayRecords.filter((r) => r.status === 'TARDY').length,
    absent: todayRecords.filter((r) => r.status === 'ABSENT').length,
    excused: todayRecords.filter((r) => r.status === 'EXCUSED').length,
  };

  // 30-day rate: (PRESENT + TARDY) / (students × distinct school days with any record)
  const schoolDays = new Set(rangeRecords.map((r) => r.date.toISOString())).size;
  const presentOrTardy = rangeRecords.filter(
    (r) => r.status === 'PRESENT' || r.status === 'TARDY',
  ).length;
  const thirtyDayRate =
    schoolDays > 0
      ? Math.round((presentOrTardy / (students.length * schoolDays)) * 1000) / 10
      : 0;

  const studentList = students.map((student) => {
    const records = rangeRecords.filter((r) => r.studentId === student.id);
    const todayRecord = todayRecords.find((r) => r.studentId === student.id);

    const tardy30 = records.filter((r) => r.status === 'TARDY').length;
    const absent30 = records.filter((r) => r.status === 'ABSENT').length;

    return {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      credentialUid: student.credentialUid,
      todayStatus: todayRecord?.status ?? null,
      thirtyDayPresent: records.filter((r) => r.status === 'PRESENT').length,
      thirtyDayTardy: tardy30,
      thirtyDayAbsent: absent30,
      ...riskFlags(tardy30, absent30),
    };
  });

  return { grade, group, today: todaySummary, thirtyDayRate, students: studentList };
}

export async function getStudentAnalytics(schoolId: string, studentId: string) {
  const student = await findStudentById(schoolId, studentId);
  if (!student) return null;

  const config = await getSchoolConfig(schoolId);
  const timezone = config?.timezone ?? 'America/Mexico_City';
  const { today, thirtyDaysAgo } = dateRange(timezone);

  const sixtyDaysAhead = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const [records, upcoming] = await Promise.all([
    findRecordsByStudentAndDateRange(student.id, thirtyDaysAgo, today),
    findRecordsByStudentAndDateRange(student.id, new Date(today.getTime() + 24 * 60 * 60 * 1000), sixtyDaysAhead),
  ]);

  const tardy30 = records.filter((r) => r.status === 'TARDY').length;
  const absent30 = records.filter((r) => r.status === 'ABSENT').length;

  const toEntry = (r: (typeof records)[number]) => ({
    id: r.id,
    date: r.date.toISOString().split('T')[0],
    status: r.status,
    scanTimestamp: r.scanTimestamp?.toISOString() ?? null,
    note: r.note,
    updatedByName: r.updatedByUser?.name ?? null,
  });
  const timeline = records.map(toEntry);
  const upcomingExcuses = upcoming.filter((r) => r.status === 'EXCUSED').map(toEntry);

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      grade: student.grade,
      group: student.group,
      credentialUid: student.credentialUid,
      guardianName: student.guardianName,
      guardianWhatsApp: student.guardianWhatsApp,
    },
    timeline,
    upcomingExcuses,
    ...riskFlags(tardy30, absent30),
  };
}

export async function overrideRecord(
  auth: AuthContext,
  id: string,
  status: AttendanceStatus,
  note?: string,
) {
  const existing = await findRecordById(auth.schoolId!, id);
  if (!existing) return null;

  return updateAttendanceRecord(id, {
    status,
    note: note ?? null,
    updatedByRole: auth.role === 'SUPERADMIN' ? UpdatedByRole.SUPERADMIN : UpdatedByRole.PRINCIPAL,
    updatedByUserId: auth.userId ?? null,
  });
}

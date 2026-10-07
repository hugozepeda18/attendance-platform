import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import {
  findStudentsByGradeAndGroup,
  findStudentsByGrade,
  findStudentsByName,
} from '../repositories/student.repository';
import {
  findRecordsByStudentIdsAndDate,
  findRecordsByStudentIdsAndDateRange,
} from '../repositories/attendance.repository';
import { getDateInTimezone } from './attendance.service';

const GROUP_PATTERN = /^(\d+)-([A-Za-z]+)$/;
const GRADE_PATTERN = /^\d+$/;

export async function searchStudents(query: string) {
  const groupMatch = query.match(GROUP_PATTERN);
  const gradeMatch = !groupMatch && GRADE_PATTERN.test(query);

  let students;
  if (groupMatch) {
    students = await findStudentsByGradeAndGroup(
      parseInt(groupMatch[1], 10),
      groupMatch[2].toUpperCase(),
    );
  } else if (gradeMatch) {
    students = await findStudentsByGrade(parseInt(query, 10));
  } else {
    students = await findStudentsByName(query);
  }

  if (students.length === 0) return [];

  const config = await getSchoolConfig();
  const timezone = config?.timezone ?? 'America/Mexico_City';
  const today = getDateInTimezone(timezone);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

  const studentIds = students.map((s) => s.id);
  const [todayRecords, rangeRecords] = await Promise.all([
    findRecordsByStudentIdsAndDate(studentIds, today),
    findRecordsByStudentIdsAndDateRange(studentIds, thirtyDaysAgo, today),
  ]);

  return students.map((student) => {
    const todayRecord = todayRecords.find((r) => r.studentId === student.id);
    const records = rangeRecords.filter((r) => r.studentId === student.id);

    return {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      grade: student.grade,
      group: student.group,
      currentStatus: todayRecord?.status ?? null,
      attendanceOverview: {
        present: records.filter((r) => r.status === 'PRESENT').length,
        tardy: records.filter((r) => r.status === 'TARDY').length,
        absent: records.filter((r) => r.status === 'ABSENT').length,
        excused: records.filter((r) => r.status === 'EXCUSED').length,
        total: records.length,
      },
    };
  });
}

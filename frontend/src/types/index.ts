export type AttendanceStatus = 'PRESENT' | 'TARDY' | 'ABSENT' | 'EXCUSED';
export type UserRole = 'TEACHER' | 'PRINCIPAL';
export type ViewTab = 'grade' | 'group';

export interface AttendanceOverview {
  present: number;
  tardy: number;
  absent: number;
  excused: number;
  total: number;
}

export interface StudentSearchResult {
  id: string;
  name: string;
  grade: number;
  group: string;
  currentStatus: AttendanceStatus | null;
  attendanceOverview: AttendanceOverview;
}

export interface GroupStudent {
  id: string;
  name: string;
  credentialUid: string;
  todayStatus: AttendanceStatus | null;
  thirtyDayPresent: number;
  thirtyDayTardy: number;
  thirtyDayAbsent: number;
  isHabituallyTardy: boolean;
  isChronicAbsentee: boolean;
}

export interface GroupAnalytics {
  grade: number;
  group: string;
  today: {
    total: number;
    present: number;
    tardy: number;
    absent: number;
    excused: number;
  };
  thirtyDayRate: number;
  students: GroupStudent[];
}

export interface TimelineEntry {
  id: string;
  date: string;
  status: AttendanceStatus;
  scanTimestamp: string | null;
}

export interface StudentAnalytics {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    grade: number;
    group: string;
    credentialUid: string;
    guardianName: string;
    guardianWhatsApp: string;
  };
  timeline: TimelineEntry[];
  isHabituallyTardy: boolean;
  isChronicAbsentee: boolean;
}

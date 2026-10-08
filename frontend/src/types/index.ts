export type AttendanceStatus = 'PRESENT' | 'TARDY' | 'ABSENT' | 'EXCUSED';
export type UserRole = 'SCANNER' | 'STAFF' | 'PRINCIPAL' | 'SUPERADMIN';

export interface Me {
  role: UserRole;
  school: { id: string; name: string; slug: string } | null;
  user: { id: string; name: string; email: string } | null;
}

export interface SchoolConfig {
  schoolStartTime: string;
  tardyGraceMinutes: number;
  absenceCutoffMinutes: number;
  timezone: string;
  principalWhatsApp?: string | null;
}

export interface SchoolSummary {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  timezone: string | null;
  studentCount: number;
}

export interface SchoolDetail {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  config: SchoolConfig | null;
  studentCount: number;
  userCount: number;
  activeKeyCount: number;
}

export interface ApiKeyInfo {
  id: string;
  role: 'SCANNER' | 'STAFF' | 'PRINCIPAL';
  label: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface SchoolUser {
  id: string;
  email: string;
  name: string;
  role: PersonRole;
  active: boolean;
  createdAt: string;
}
export type ViewTab = 'grade' | 'group' | 'staff' | 'students' | 'requests' | 'calendar';
export type PersonRole = 'STAFF' | 'PRINCIPAL';

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
    nonSchoolDay: string | null; // no classes today and why
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
  note: string | null;
  updatedByName: string | null;
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
  upcomingExcuses: TimelineEntry[];
  nonSchoolDays: { date: string; label: string }[];
  isHabituallyTardy: boolean;
  isChronicAbsentee: boolean;
}

export interface GroupInfo {
  grade: number;
  group: string;
  students: number;
}

export interface RosterStudent {
  id: string;
  firstName: string;
  lastName: string;
  grade: number;
  group: string;
  credentialUid: string;
  guardianName: string;
  guardianWhatsApp: string;
  active: boolean;
}

export type RequestState = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ChangeRequest {
  id: string;
  student: { id: string; name: string; grade: number; group: string };
  date: string;
  fromStatus: AttendanceStatus | null;
  toStatus: AttendanceStatus;
  reason: string;
  state: RequestState;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface CalendarDay {
  date: string;
  label: string;
  source: 'SEP' | 'SCHOOL';
  id?: string; // school days only (deletable)
}

export interface SchoolCalendar {
  schoolYear: string | null;
  start: string | null;
  end: string | null;
  days: CalendarDay[];
}

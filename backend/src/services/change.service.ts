import { AttendanceStatus, RequestState, UpdatedByRole } from '@prisma/client';
import { AuthContext } from './auth.service';
import { getDateInTimezone } from './attendance.service';
import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import { findStudentById } from '../repositories/student.repository';
import prisma from '../lib/prisma';
import { alertPrincipal, changeRequestDay } from './outbox.service';
import {
  countPendingRequests,
  createChangeRequest,
  decideChangeRequest,
  findChangeRequest,
  findPendingRequest,
  listChangeRequests,
} from '../repositories/changeRequest.repository';

export class ChangeRuleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MAX_PAST_DAYS = 30; // the history the student modal shows
const DAY_MS = 24 * 60 * 60 * 1000;
const toYmd = (d: Date) => d.toISOString().slice(0, 10);

export interface ChangeInput {
  studentId: string;
  date: string; // YYYY-MM-DD, school-local
  status: AttendanceStatus;
  reason: string;
}

// Sets a student's status for a day, creating the record if the day has none yet (e.g. a late
// arrival registered before the absence run, which then skips the student). No message is sent:
// the guardian never gets corrections.
async function applyChange(studentId: string, date: Date, status: AttendanceStatus, note: string, auth: AuthContext) {
  const by = {
    status,
    note,
    updatedByRole: auth.role === 'SUPERADMIN' ? UpdatedByRole.SUPERADMIN : UpdatedByRole.PRINCIPAL,
    updatedByUserId: auth.userId ?? null,
  };
  return prisma.attendanceRecord.upsert({
    where: { studentId_date: { studentId, date } },
    create: { studentId, date, ...by },
    update: by,
  });
}

// Staff → a PENDING request for the principal. Principal (or super-admin) → applied right away.
export async function requestChange(auth: AuthContext, input: ChangeInput) {
  const schoolId = auth.schoolId!;
  const student = await findStudentById(schoolId, input.studentId);
  if (!student?.active) return null;

  const config = await getSchoolConfig(schoolId);
  if (!config) throw new Error('School configuration not found');
  const today = getDateInTimezone(config.timezone);
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (date > today) throw new ChangeRuleError('FUTURE_DATE', 'Future days are excused in advance, not changed');
  if ((today.getTime() - date.getTime()) / DAY_MS >= MAX_PAST_DAYS) {
    throw new ChangeRuleError('TOO_OLD', `Only the last ${MAX_PAST_DAYS} days can be changed`);
  }

  const current = await prisma.attendanceRecord.findUnique({ where: { studentId_date: { studentId: student.id, date } } });
  if (current?.status === input.status) throw new ChangeRuleError('NO_CHANGE', `The student is already ${input.status} that day`);

  if (auth.role !== 'STAFF') {
    const record = await applyChange(student.id, date, input.status, input.reason, auth);
    return { applied: true as const, record: { id: record.id, date: toYmd(record.date), status: record.status } };
  }

  if (await findPendingRequest(schoolId, student.id, date)) {
    throw new ChangeRuleError('ALREADY_REQUESTED', 'There is already a pending request for this student and day');
  }
  const request = await createChangeRequest({
    schoolId,
    studentId: student.id,
    date,
    fromStatus: current?.status ?? null,
    toStatus: input.status,
    reason: input.reason,
    requestedById: auth.userId!,
  });
  // The principal sees it in the Requests tab (badge with the count) and gets a WhatsApp alert.
  await alertPrincipal(schoolId, 'solicitud_cambio', [
    request.requestedBy.name,
    `${student.firstName} ${student.lastName} (${changeRequestDay(date)})`,
  ]);
  return { applied: false as const, request: view(request) };
}

// Staff see their own requests; the principal sees the whole school's.
export async function getChangeRequests(auth: AuthContext, state?: RequestState) {
  const requestedById = auth.role === 'STAFF' ? auth.userId! : undefined;
  const [requests, pending] = await Promise.all([
    listChangeRequests(auth.schoolId!, { state, requestedById }),
    countPendingRequests(auth.schoolId!),
  ]);
  return { requests: requests.map(view), pending: auth.role === 'STAFF' ? undefined : pending };
}

// Principal only. Approving applies the requested status as it is now (the principal saw the
// current one in the list); rejecting leaves the record untouched.
export async function decideChange(auth: AuthContext, id: string, approve: boolean) {
  const request = await findChangeRequest(auth.schoolId!, id);
  if (!request) return null;
  const decided = await decideChangeRequest(id, approve ? RequestState.APPROVED : RequestState.REJECTED, auth.userId ?? null);
  if (!decided) throw new ChangeRuleError('ALREADY_DECIDED', 'This request was already approved or rejected');
  if (approve) await applyChange(request.studentId, request.date, request.toStatus, request.reason, auth);
  return { id, state: approve ? RequestState.APPROVED : RequestState.REJECTED };
}

type Row = Awaited<ReturnType<typeof listChangeRequests>>[number];
function view(r: Row) {
  return {
    id: r.id,
    student: { id: r.student.id, name: `${r.student.firstName} ${r.student.lastName}`, grade: r.student.grade, group: r.student.group },
    date: toYmd(r.date),
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    reason: r.reason,
    state: r.state,
    requestedBy: r.requestedBy.name,
    decidedBy: r.decidedBy?.name ?? (r.decidedAt ? 'Platform support' : null),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

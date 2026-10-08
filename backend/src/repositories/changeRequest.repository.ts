import { AttendanceStatus, RequestState } from '@prisma/client';
import prisma from '../lib/prisma';

const include = {
  student: { select: { id: true, firstName: true, lastName: true, grade: true, group: true } },
  requestedBy: { select: { name: true } },
  decidedBy: { select: { name: true } },
};

export async function createChangeRequest(data: {
  schoolId: string;
  studentId: string;
  date: Date;
  fromStatus: AttendanceStatus | null;
  toStatus: AttendanceStatus;
  reason: string;
  requestedById: string;
}) {
  return prisma.changeRequest.create({ data, include });
}

export async function findPendingRequest(schoolId: string, studentId: string, date: Date) {
  return prisma.changeRequest.findFirst({ where: { schoolId, studentId, date, state: RequestState.PENDING } });
}

export async function findChangeRequest(schoolId: string, id: string) {
  return prisma.changeRequest.findFirst({ where: { id, schoolId } });
}

// ponytail: newest 100; add paging when a school keeps more than that in view.
export async function listChangeRequests(schoolId: string, filter: { state?: RequestState; requestedById?: string }) {
  return prisma.changeRequest.findMany({
    where: { schoolId, ...filter },
    include,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function countPendingRequests(schoolId: string) {
  return prisma.changeRequest.count({ where: { schoolId, state: RequestState.PENDING } });
}

// Only a still-pending request is decided (two principals clicking at once: the second gets 0 rows).
export async function decideChangeRequest(id: string, state: RequestState, decidedById: string | null) {
  const { count } = await prisma.changeRequest.updateMany({
    where: { id, state: RequestState.PENDING },
    data: { state, decidedById, decidedAt: new Date() },
  });
  return count === 1;
}

import { MessageStatus, MessageType, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { NotifierService, SendError, notifier } from './notifier';
import { TemplateName } from './templates';

// Rows are written together with the attendance record (nested create): no record without its
// message, no message without its record. The worker (src/worker.ts) delivers them.

export const ENTRY_MAX_AGE_MS = 2 * 60 * 60_000; // older "entered school" messages are useless: EXPIRED
export const MERGE_WINDOW_MS = 2 * 60_000; // entry messages wait this long so siblings go in one message
const LEASE_MS = 5 * 60_000; // a row SENDING longer than this belongs to a crashed worker and is retried
const MAX_ATTEMPTS = 5;
const backoffMs = (attempts: number) => 30_000 * 2 ** (attempts - 1); // 30 s, 1, 2, 4 min

type Row = Prisma.NotificationUncheckedCreateWithoutRecordInput;
interface Who {
  schoolId: string;
  firstName: string;
  lastName: string;
  guardianWhatsApp: string;
}

const hhmm = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(at);
const dayText = (date: Date) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);

export function entryMessage(student: Who, status: 'PRESENT' | 'TARDY', at: Date, timezone: string): Row {
  return {
    schoolId: student.schoolId,
    type: MessageType.ENTRY,
    template: status === 'TARDY' ? 'entrada_retardo' : 'entrada',
    phone: student.guardianWhatsApp,
    params: [`${student.firstName} ${student.lastName}`, hhmm(at, timezone)],
    eventAt: at,
    nextAttemptAt: new Date(at.getTime() + MERGE_WINDOW_MS),
  };
}

export function absenceMessage(student: Who, date: Date): Row {
  return {
    schoolId: student.schoolId,
    type: MessageType.ABSENCE,
    template: 'inasistencia',
    phone: student.guardianWhatsApp,
    params: [`${student.firstName} ${student.lastName}`, dayText(date)],
    eventAt: new Date(),
    nextAttemptAt: new Date(), // the app's clock, not the database's
  };
}

// To the school's principal WhatsApp (admin dashboard); nothing when the school has none.
export async function alertPrincipal(schoolId: string, template: TemplateName, params: string[]) {
  const config = await prisma.schoolConfig.findUnique({ where: { schoolId }, select: { principalWhatsApp: true } });
  if (!config?.principalWhatsApp) return;
  await prisma.notification.create({
    data: { schoolId, type: MessageType.PRINCIPAL_ALERT, template, phone: config.principalWhatsApp, params, eventAt: new Date(), nextAttemptAt: new Date() },
  });
}
export const changeRequestDay = dayText;

// One worker pass: sends every due row. A row is claimed (SENDING + lease) before sending, so two
// workers never send the same row. ponytail: sequential sends (a few per second, Meta allows 80/s);
// parallel batches if a single absence run ever takes too long.
export async function deliverDue(provider: NotifierService = notifier, now = new Date()): Promise<number> {
  const due = await prisma.notification.findMany({
    where: { status: { in: [MessageStatus.PENDING, MessageStatus.SENDING] }, nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: 200,
  });
  let sent = 0;
  for (const row of due) if (await deliver(row, provider, now)) sent++;
  return sent;
}

async function claim(where: Prisma.NotificationWhereInput, now: Date) {
  return (await prisma.notification.updateMany({
    where,
    data: { status: MessageStatus.SENDING, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
  })).count;
}

async function deliver(row: Prisma.NotificationGetPayload<object>, provider: NotifierService, now: Date): Promise<boolean> {
  if (!(await claim({ id: row.id, status: row.status, nextAttemptAt: row.nextAttemptAt }, now))) return false;

  if (row.type === MessageType.ENTRY && now.getTime() - row.eventAt.getTime() > ENTRY_MAX_AGE_MS) {
    await prisma.notification.update({ where: { id: row.id }, data: { status: MessageStatus.EXPIRED } });
    return false;
  }

  // Siblings: other entry messages to the same phone within the window go out as one message.
  const params = row.params as string[];
  const ids = [row.id];
  if (row.type === MessageType.ENTRY) {
    const siblings = await prisma.notification.findMany({
      where: {
        id: { not: row.id },
        status: MessageStatus.PENDING,
        type: MessageType.ENTRY,
        schoolId: row.schoolId,
        phone: row.phone,
        template: row.template,
        eventAt: { gte: new Date(row.eventAt.getTime() - MERGE_WINDOW_MS), lte: new Date(row.eventAt.getTime() + MERGE_WINDOW_MS) },
      },
      orderBy: { eventAt: 'asc' },
    });
    const names = [params[0]];
    for (const s of siblings) {
      if (await claim({ id: s.id, status: MessageStatus.PENDING }, now)) {
        ids.push(s.id);
        names.push((s.params as string[])[0]);
      }
    }
    params[0] = new Intl.ListFormat('es', { type: 'conjunction' }).format(names);
  }

  const school = await prisma.school.findUniqueOrThrow({ where: { id: row.schoolId }, select: { name: true } });
  const where = { id: { in: ids } };
  try {
    const providerId = await provider.send({ phone: row.phone, template: row.template as TemplateName, params: [school.name, ...params] });
    // ponytail: a crash between the provider accepting and this write resends after the lease (rare duplicate, never a lost absence notice).
    await prisma.notification.updateMany({
      where,
      data: { status: MessageStatus.SENT, providerId, sentAt: now, lastError: null, attempts: { increment: 1 } },
    });
    return true;
  } catch (err) {
    const attempts = row.attempts + 1;
    const failed = (err instanceof SendError && err.permanent) || attempts >= MAX_ATTEMPTS;
    console.error(`[Worker] ${row.template} → ${row.phone} attempt ${attempts} failed${failed ? ' (FAILED)' : ''}:`, (err as Error).message);
    await prisma.notification.updateMany({
      where,
      data: {
        status: failed ? MessageStatus.FAILED : MessageStatus.PENDING,
        nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
        lastError: (err as Error).message.slice(0, 500),
        attempts: { increment: 1 },
      },
    });
    return false;
  }
}

// Delivery receipts from the WhatsApp webhook. They can arrive out of order, so a status never goes back
// (READ stays READ when a late "delivered" arrives).
const NEXT: Record<string, { status: MessageStatus; from: MessageStatus[] }> = {
  sent: { status: MessageStatus.SENT, from: [MessageStatus.SENDING] },
  delivered: { status: MessageStatus.DELIVERED, from: [MessageStatus.SENDING, MessageStatus.SENT] },
  read: { status: MessageStatus.READ, from: [MessageStatus.SENDING, MessageStatus.SENT, MessageStatus.DELIVERED] },
  failed: { status: MessageStatus.FAILED, from: [MessageStatus.SENDING, MessageStatus.SENT] },
};

export async function applyDeliveryStatuses(statuses: { id: string; status: string; errors?: { title?: string }[] }[]) {
  for (const s of statuses) {
    const next = NEXT[s.status];
    if (!next) continue;
    await prisma.notification.updateMany({
      where: { providerId: s.id, status: { in: next.from } },
      data: { status: next.status, ...(s.status === 'failed' && { lastError: s.errors?.[0]?.title ?? 'failed' }) },
    });
  }
}

// Retention (privacy notice): message and scan logs hold guardian phone numbers and badge reads; they are
// kept 90 days for delivery questions, then deleted. Attendance records stay (they are the school's record).
// Gates never resend a scan older than 20 h, so deleting old scan events cannot reopen a replay.
export const LOG_RETENTION_DAYS = 90;
export async function purgeOldLogs(now = new Date()) {
  const before = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60_000);
  const [messages, scans] = await prisma.$transaction([
    prisma.notification.deleteMany({ where: { createdAt: { lt: before } } }),
    prisma.scanEvent.deleteMany({ where: { createdAt: { lt: before } } }),
  ]);
  return { messages: messages.count, scans: scans.count };
}

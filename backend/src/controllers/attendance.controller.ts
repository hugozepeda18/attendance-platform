import { Request, Response } from 'express';
import { z } from 'zod';
import { schoolIdOf } from '../middleware/auth';
import { processScan, ScanOutcome } from '../services/attendance.service';

// Readers may produce a number; the server normalizes in one place (normalizeCredential).
const credentialUid = z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1, 'credentialUid is required').max(128));
const eventId = z.string().trim().min(1).max(64);
const isoDate = z.string().datetime({ offset: true }).transform((v) => new Date(v));

const ScanSchema = z.object({
  credentialUid,
  eventId: eventId.optional(),
  scannedAt: isoDate.optional(),
  sentAt: isoDate.optional(),
});

const BatchSchema = z.object({
  sentAt: isoDate,
  events: z.array(z.object({ eventId, credentialUid, scannedAt: isoDate })).min(1).max(500),
});

function badInput(res: Response, error: z.ZodError): void {
  const issue = error.errors[0];
  res.status(400).json({ error: 'INVALID_INPUT', message: `${issue.path.join('.') || 'body'}: ${issue.message}` });
}

function gateFields(o: ScanOutcome) {
  return { eventId: o.eventId, student: o.studentName, grade: o.grade, group: o.group, clockSkew: o.clockSkew };
}

export async function scan(req: Request, res: Response): Promise<void> {
  const parsed = ScanSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed.error);

  try {
    const o = await processScan(schoolIdOf(req), parsed.data);
    switch (o.result) {
      case 'PRESENT':
      case 'TARDY':
        res.status(201).json({ success: true, status: o.result, timestamp: o.scannedAt, alreadyScanned: false, ...gateFields(o) });
        break;
      case 'ALREADY_SCANNED':
        res.status(409).json({ error: 'ALREADY_SCANNED', message: 'Attendance already recorded for today', alreadyScanned: true, ...gateFields(o) });
        break;
      case 'OUTSIDE_WINDOW':
        res.status(422).json({ error: 'OUTSIDE_WINDOW', message: 'Attendance window closed for today; student must go to the office', ...gateFields(o) });
        break;
      case 'NOT_FOUND':
        res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: 'Student not found', eventId: o.eventId });
    }
  } catch (err) {
    console.error('[scan]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

// Offline queue upload from a gate PC. Events are processed in order; each gets its own result,
// so one bad badge never blocks the rest. A failed request is safe to resend (eventId idempotency).
export async function scanBatch(req: Request, res: Response): Promise<void> {
  const parsed = BatchSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed.error);

  try {
    const results: ScanOutcome[] = [];
    for (const event of parsed.data.events) {
      results.push(await processScan(schoolIdOf(req), { ...event, sentAt: parsed.data.sentAt }));
    }
    res.json({ results });
  } catch (err) {
    console.error('[scanBatch]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

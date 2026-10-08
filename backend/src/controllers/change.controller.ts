import { Request, Response } from 'express';
import { z } from 'zod';
import { ChangeRuleError, decideChange, getChangeRequests, requestChange } from '../services/change.service';

const status = z.enum(['PRESENT', 'TARDY', 'ABSENT', 'EXCUSED']);
const ChangeSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  status,
  reason: z.string().trim().min(1, 'reason is required').max(200),
});
const ListSchema = z.object({ state: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() });

function fail(res: Response, err: unknown, label: string): void {
  if (err instanceof ChangeRuleError) {
    res.status(err.code === 'ALREADY_REQUESTED' || err.code === 'ALREADY_DECIDED' ? 409 : 400).json({ error: err.code, message: err.message });
    return;
  }
  console.error(`[${label}]`, err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
}

export async function postChange(req: Request, res: Response): Promise<void> {
  const parsed = ChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }
  try {
    const result = await requestChange(req.auth!, parsed.data);
    if (!result) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found' });
      return;
    }
    res.status(result.applied ? 200 : 202).json(result);
  } catch (err) {
    fail(res, err, 'postChange');
  }
}

export async function listChanges(req: Request, res: Response): Promise<void> {
  const parsed = ListSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }
  try {
    res.json(await getChangeRequests(req.auth!, parsed.data.state));
  } catch (err) {
    fail(res, err, 'listChanges');
  }
}

export function decide(approve: boolean) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await decideChange(req.auth!, String(req.params.id), approve);
      if (!result) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Request not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      fail(res, err, 'decideChange');
    }
  };
}

import { Request, Response } from 'express';
import { z } from 'zod';
import { excuseInAdvance, ExcuseRuleError } from '../services/excuse.service';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dates must be YYYY-MM-DD');

const ExcuseSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  from: ymd,
  to: ymd.optional(),
  reason: z.string().trim().min(1, 'reason is required').max(200),
});

export async function postExcuse(req: Request, res: Response): Promise<void> {
  const parsed = ExcuseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }
  try {
    const result = await excuseInAdvance(req.auth!, parsed.data);
    if (!result) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found' });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ExcuseRuleError) {
      res.status(400).json({ error: 'EXCUSE_NOT_ALLOWED', message: err.message });
      return;
    }
    console.error('[postExcuse]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

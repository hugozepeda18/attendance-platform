import { Request, Response } from 'express';
import { z } from 'zod';
import { schoolIdOf } from '../middleware/auth';
import { processScan, StudentNotFoundError, AlreadyScannedError } from '../services/attendance.service';

const ScanSchema = z.object({
  credentialUid: z.string().min(1, 'credentialUid is required'),
});

export async function scan(req: Request, res: Response): Promise<void> {
  const parsed = ScanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }

  try {
    const result = await processScan(schoolIdOf(req), parsed.data.credentialUid);
    res.status(201).json({
      success: true,
      student: result.studentName,
      status: result.status,
      timestamp: result.timestamp.toISOString(),
    });
  } catch (err) {
    if (err instanceof StudentNotFoundError) {
      res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: err.message });
    } else if (err instanceof AlreadyScannedError) {
      res.status(409).json({ error: 'ALREADY_SCANNED', message: 'Attendance already recorded for today' });
    } else {
      console.error('[scan]', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  }
}

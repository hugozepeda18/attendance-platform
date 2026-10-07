import { Request, Response } from 'express';
import { z } from 'zod';
import { recordHeartbeat } from '../repositories/school.repository';

const HeartbeatSchema = z.object({ pending: z.number().int().min(0) });

// Sent every minute by each gate PC. `pending` = scans still queued locally; the absence run waits for 0.
export async function heartbeat(req: Request, res: Response): Promise<void> {
  const parsed = HeartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'pending must be a non-negative integer' });
    return;
  }
  const apiKeyId = req.auth!.apiKeyId;
  if (!apiKeyId) {
    res.status(400).json({ error: 'SCANNER_KEY_REQUIRED', message: 'Heartbeats come from a gate scanner key' });
    return;
  }
  await recordHeartbeat(apiKeyId, parsed.data.pending);
  res.json({ serverTime: new Date().toISOString() });
}

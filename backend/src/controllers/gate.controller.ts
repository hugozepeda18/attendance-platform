import { Request, Response } from 'express';
import { z } from 'zod';
import { recordHeartbeat } from '../repositories/school.repository';
import { getGateRoster } from '../services/gate.service';
import { schoolIdOf } from '../middleware/auth';

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
  // GATE_LATEST_VERSION: set it when a new gate.exe is released; gates on another version show "Actualización disponible".
  res.json({ serverTime: new Date().toISOString(), latestGateVersion: process.env.GATE_LATEST_VERSION ?? null });
}

export async function roster(req: Request, res: Response): Promise<void> {
  res.json(await getGateRoster(schoolIdOf(req)));
}

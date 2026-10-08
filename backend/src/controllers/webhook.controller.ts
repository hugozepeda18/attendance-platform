import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { applyDeliveryStatuses } from '../services/outbox.service';

// Meta calls this once when the webhook is configured (App → WhatsApp → Configuration).
export function verifyWebhook(req: Request, res: Response): void {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token) {
    res.status(200).send(String(req.query['hub.challenge'] ?? ''));
    return;
  }
  res.sendStatus(403);
}

// Signed by Meta with the app secret over the exact request body.
function validSignature(req: Request): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const header = req.get('x-hub-signature-256') ?? '';
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!secret || !raw) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const StatusesSchema = z.object({
  entry: z.array(z.object({
    changes: z.array(z.object({
      value: z.object({
        statuses: z.array(z.object({ id: z.string(), status: z.string(), errors: z.array(z.object({ title: z.string().optional() })).optional() })).optional(),
      }).passthrough(),
    })),
  })),
});

// Delivery receipts (sent / delivered / read / failed). Other events (incoming replies) are acknowledged and ignored.
export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  if (!validSignature(req)) {
    res.sendStatus(401);
    return;
  }
  const parsed = StatusesSchema.safeParse(req.body);
  if (parsed.success) {
    const statuses = parsed.data.entry.flatMap((e) => e.changes.flatMap((c) => c.value.statuses ?? []));
    await applyDeliveryStatuses(statuses);
  }
  res.sendStatus(200);
}

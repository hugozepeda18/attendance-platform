import 'dotenv/config';
import { deliverDue } from './services/outbox.service';
import { notifier } from './services/notifier';

// Sends the WhatsApp outbox. Separate process from the API (`npm run worker`); safe to restart at any
// time: unsent rows stay in the database, and rows it was sending come back after their lease.
const POLL_MS = 5_000;

console.log(`[Worker] delivering messages via ${notifier.name}, every ${POLL_MS / 1000} s`);
if (notifier.name === 'console' && process.env.NODE_ENV === 'production') {
  console.warn('[Worker] WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set: messages are only printed');
}

async function loop(): Promise<void> {
  for (;;) {
    try {
      await deliverDue();
    } catch (err) {
      console.error('[Worker] pass failed (retried next pass):', err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

void loop();

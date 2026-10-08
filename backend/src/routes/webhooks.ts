import { Router } from 'express';
import { receiveWebhook, verifyWebhook } from '../controllers/webhook.controller';

// Called by Meta, not by users: no session; POSTs are checked against the app secret signature.
const router = Router();

router.get('/webhooks/whatsapp', verifyWebhook);
router.post('/webhooks/whatsapp', receiveWebhook);

export default router;

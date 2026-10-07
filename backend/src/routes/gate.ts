import { Router } from 'express';
import { authenticate, requireTenant, requireRole } from '../middleware/auth';
import { heartbeat, roster } from '../controllers/gate.controller';

const router = Router();
const gate = [authenticate, requireTenant, requireRole('SCANNER')];

router.post('/gate/heartbeat', ...gate, heartbeat);
router.get('/gate/roster', ...gate, roster);

export default router;

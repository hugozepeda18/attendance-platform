import { Router } from 'express';
import { authenticate, requireTenant, requireRole } from '../middleware/auth';
import { heartbeat } from '../controllers/gate.controller';

const router = Router();

router.post('/gate/heartbeat', authenticate, requireTenant, requireRole('SCANNER'), heartbeat);

export default router;

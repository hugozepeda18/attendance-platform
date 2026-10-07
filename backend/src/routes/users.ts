import { Router } from 'express';
import { authenticate, requireTenant } from '../middleware/auth';
import { principalGuard } from '../middleware/principalGuard';
import { listUsers, createUser, patchUser } from '../controllers/users.controller';

const router = Router();

// A school's principal manages its staff accounts; the super-admin can too (x-school-id),
// which is how each new school's first principal is created.
router.use('/users', authenticate, requireTenant, principalGuard);

router.get('/users', listUsers);
router.post('/users', createUser);
router.patch('/users/:id', patchUser);

export default router;

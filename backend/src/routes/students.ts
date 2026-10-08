import { Router } from 'express';
import { authenticate, requireTenant, requireRole } from '../middleware/auth';
import { principalGuard } from '../middleware/principalGuard';
import {
  createStudentHandler,
  listGroupsHandler,
  listStudentsHandler,
  patchStudentHandler,
} from '../controllers/students.controller';

const router = Router();

// The school's roster: office staff and the principal read it; only the principal changes it.
router.use('/students', authenticate, requireTenant, requireRole('STAFF', 'PRINCIPAL'));

router.get('/students/groups', listGroupsHandler);
router.get('/students', principalGuard, listStudentsHandler);
router.post('/students', principalGuard, createStudentHandler);
router.patch('/students/:id', principalGuard, patchStudentHandler);

export default router;

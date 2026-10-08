import { Router } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import {
  createSchool,
  listSchools,
  getSchool,
  patchSchool,
  createKey,
  listKeys,
  deleteKey,
  slugAvailable,
  createSupportSession,
} from '../controllers/admin.controller';

const router = Router();

router.use('/admin', authenticate, requireSuperAdmin);

router.post('/admin/schools', createSchool);
router.get('/admin/slug-available', slugAvailable);
router.post('/admin/schools/:id/support', createSupportSession);
router.get('/admin/schools', listSchools);
router.get('/admin/schools/:id', getSchool);
router.patch('/admin/schools/:id', patchSchool);
router.get('/admin/schools/:id/keys', listKeys);
router.post('/admin/schools/:id/keys', createKey);
router.delete('/admin/schools/:id/keys/:keyId', deleteKey);

export default router;

import { Router } from 'express';
import { scan, scanBatch } from '../controllers/attendance.controller';
import { search } from '../controllers/search.controller';
import { groupAnalytics, studentAnalytics, patchRecord } from '../controllers/analytics.controller';
import { authenticate, requireTenant, requireRole } from '../middleware/auth';
import { principalGuard } from '../middleware/principalGuard';
import { postExcuse } from '../controllers/excuse.controller';
import { decide, listChanges, postChange } from '../controllers/change.controller';

const router = Router();

// Every attendance route is tenant-scoped; scanners may only scan (no student PII reads).
router.use('/attendance', authenticate, requireTenant);
const staff = requireRole('STAFF', 'PRINCIPAL');

const scanner = requireRole('SCANNER', 'STAFF', 'PRINCIPAL');
router.post('/attendance/scan', scanner, scan);
router.post('/attendance/scans', scanner, scanBatch);
router.get('/attendance/search', staff, search);
router.get('/attendance/analytics/group/:grade/:group', staff, groupAnalytics);
router.get('/attendance/analytics/student/:id', staff, studentAnalytics);
router.patch('/attendance/record/:id', principalGuard, patchRecord);
router.post('/attendance/excuses', staff, postExcuse);
// Staff request a change, the principal approves or rejects it; a principal's own change applies at once.
router.post('/attendance/changes', staff, postChange);
router.get('/attendance/changes', staff, listChanges);
router.post('/attendance/changes/:id/approve', principalGuard, decide(true));
router.post('/attendance/changes/:id/reject', principalGuard, decide(false));

export default router;

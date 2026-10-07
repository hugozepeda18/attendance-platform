import { Router } from 'express';
import { scan, scanBatch } from '../controllers/attendance.controller';
import { search } from '../controllers/search.controller';
import { groupAnalytics, studentAnalytics, patchRecord } from '../controllers/analytics.controller';
import { authenticate, requireTenant, requireRole } from '../middleware/auth';
import { principalGuard } from '../middleware/principalGuard';
import { postExcuse } from '../controllers/excuse.controller';

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

export default router;

import { Router } from 'express';
import { scan } from '../controllers/attendance.controller';
import { search } from '../controllers/search.controller';
import { groupAnalytics, studentAnalytics, patchRecord } from '../controllers/analytics.controller';
import { principalGuard } from '../middleware/principalGuard';

const router = Router();

router.post('/attendance/scan', scan);
router.get('/attendance/search', search);
router.get('/attendance/analytics/group/:grade/:group', groupAnalytics);
router.get('/attendance/analytics/student/:id', studentAnalytics);
router.patch('/attendance/record/:id', principalGuard, patchRecord);

export default router;

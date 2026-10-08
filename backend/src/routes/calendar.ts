import { Router } from 'express';
import { authenticate, requireTenant, requireRole } from '../middleware/auth';
import { principalGuard } from '../middleware/principalGuard';
import { deleteCalendarDay, listCalendar, postCalendarDay } from '../controllers/calendar.controller';

const router = Router();

// The school's days without classes: SEP calendar + its own. Staff read; the principal adds/removes its own.
router.use('/calendar', authenticate, requireTenant, requireRole('STAFF', 'PRINCIPAL'));
router.get('/calendar', listCalendar);
router.post('/calendar/days', principalGuard, postCalendarDay);
router.delete('/calendar/days/:id', principalGuard, deleteCalendarDay);

export default router;

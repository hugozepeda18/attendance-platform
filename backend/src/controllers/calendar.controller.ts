import { Request, Response } from 'express';
import { z } from 'zod';
import { schoolIdOf } from '../middleware/auth';
import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import { getDateInTimezone } from '../services/attendance.service';
import { addSchoolDay, CalendarRuleError, getCalendar, removeSchoolDay } from '../services/calendar.service';

const DaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  label: z.string().trim().min(1, 'reason is required').max(100),
});

async function today(schoolId: string): Promise<Date> {
  const config = await getSchoolConfig(schoolId);
  return getDateInTimezone(config?.timezone ?? 'America/Mexico_City');
}

function fail(res: Response, err: unknown, label: string): void {
  if (err instanceof CalendarRuleError) {
    res.status(400).json({ error: 'CALENDAR_RULE', message: err.message });
    return;
  }
  console.error(`[${label}]`, err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
}

export async function listCalendar(req: Request, res: Response): Promise<void> {
  try {
    res.json(await getCalendar(schoolIdOf(req), await today(schoolIdOf(req))));
  } catch (err) {
    fail(res, err, 'listCalendar');
  }
}

export async function postCalendarDay(req: Request, res: Response): Promise<void> {
  const parsed = DaySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }
  try {
    const schoolId = schoolIdOf(req);
    res.status(201).json(await addSchoolDay(schoolId, await today(schoolId), parsed.data.date, parsed.data.label));
  } catch (err) {
    fail(res, err, 'postCalendarDay');
  }
}

export async function deleteCalendarDay(req: Request, res: Response): Promise<void> {
  try {
    if (!(await removeSchoolDay(schoolIdOf(req), String(req.params.id)))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Day not found' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    fail(res, err, 'deleteCalendarDay');
  }
}

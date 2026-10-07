import { Request, Response } from 'express';
import { getGroupAnalytics, getStudentAnalytics, overrideRecord, OverrideSchema } from '../services/analytics.service';

export async function groupAnalytics(req: Request, res: Response): Promise<void> {
  const grade = parseInt(String(req.params.grade), 10);
  const group = String(req.params.group).toUpperCase();

  if (isNaN(grade)) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'grade must be a number' });
    return;
  }

  try {
    const data = await getGroupAnalytics(grade, group);
    if (!data) {
      res.status(404).json({ error: 'NOT_FOUND', message: `No students found for grade ${grade}, group ${group}` });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error('[groupAnalytics]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

export async function studentAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const data = await getStudentAnalytics(String(req.params.id));
    if (!data) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found' });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error('[studentAnalytics]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

export async function patchRecord(req: Request, res: Response): Promise<void> {
  const parsed = OverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }

  try {
    const updated = await overrideRecord(String(req.params.id), parsed.data.status, parsed.data.note);
    if (!updated) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Attendance record not found' });
      return;
    }
    res.json({
      id: updated.id,
      status: updated.status,
      note: updated.note,
      updatedByRole: updated.updatedByRole,
    });
  } catch (err) {
    console.error('[patchRecord]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

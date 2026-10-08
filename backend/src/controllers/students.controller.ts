import { Request, Response } from 'express';
import { z } from 'zod';
import { schoolIdOf } from '../middleware/auth';
import { addStudent, BadgeTakenError, editStudent, getGroups, getStudents } from '../services/student.service';
import { whatsappSchema } from '../lib/validation';

const name = z.string().trim().min(1).max(80);
const fields = {
  firstName: name,
  lastName: name,
  grade: z.number().int().min(1).max(3), // secundaria only
  group: z.string().trim().toUpperCase().regex(/^[A-Z]{1,2}$/, 'group must be 1-2 letters, e.g. A'),
  credentialUid: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1, 'badge is required').max(128)),
  guardianName: name,
  guardianWhatsApp: whatsappSchema,
};

const CreateSchema = z.object(fields);
const UpdateSchema = z
  .object({ ...fields, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'nothing to update');

const ListSchema = z.object({
  grade: z.coerce.number().int().optional(),
  group: z.string().toUpperCase().optional(),
});

function fail(res: Response, err: unknown, label: string): void {
  if (err instanceof BadgeTakenError) {
    res.status(409).json({ error: 'BADGE_TAKEN', message: err.message });
    return;
  }
  console.error(`[${label}]`, err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
}

export async function listStudentsHandler(req: Request, res: Response): Promise<void> {
  const parsed = ListSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }
  try {
    res.json({ students: await getStudents(schoolIdOf(req), parsed.data.grade, parsed.data.group) });
  } catch (err) {
    fail(res, err, 'listStudents');
  }
}

export async function listGroupsHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json({ groups: await getGroups(schoolIdOf(req)) });
  } catch (err) {
    fail(res, err, 'listGroups');
  }
}

export async function createStudentHandler(req: Request, res: Response): Promise<void> {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }
  try {
    res.status(201).json(await addStudent(schoolIdOf(req), parsed.data));
  } catch (err) {
    fail(res, err, 'createStudent');
  }
}

export async function patchStudentHandler(req: Request, res: Response): Promise<void> {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }
  try {
    const student = await editStudent(schoolIdOf(req), String(req.params.id), parsed.data);
    if (!student) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found' });
      return;
    }
    res.json(student);
  } catch (err) {
    fail(res, err, 'patchStudent');
  }
}

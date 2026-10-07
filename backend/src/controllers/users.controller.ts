import { Request, Response } from 'express';
import { z } from 'zod';
import { schoolIdOf } from '../middleware/auth';
import { addUser, editUser, getUsers, EmailTakenError, SelfLockoutError } from '../services/user.service';
import { emailSchema, passwordSchema } from '../lib/validation';

// People sign in to the web page; SCANNER is a device role (API keys only).
const personRole = z.enum(['STAFF', 'PRINCIPAL']);

const CreateUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, 'name is required'),
  role: personRole,
  password: passwordSchema,
});

const UpdateUserSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    role: personRole.optional(),
    active: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to update');

function fail(res: Response, err: unknown, name: string): void {
  if (err instanceof EmailTakenError) {
    res.status(409).json({ error: 'EMAIL_TAKEN', message: 'A user with this email already exists in this school' });
  } else if (err instanceof SelfLockoutError) {
    res.status(400).json({ error: 'SELF_LOCKOUT', message: 'You cannot deactivate or change the role of your own account' });
  } else {
    console.error(`[${name}]`, err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    res.json({ users: await getUsers(schoolIdOf(req)) });
  } catch (err) {
    fail(res, err, 'listUsers');
  }
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }
  try {
    res.status(201).json(await addUser(schoolIdOf(req), parsed.data));
  } catch (err) {
    fail(res, err, 'createUser');
  }
}

export async function patchUser(req: Request, res: Response): Promise<void> {
  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }
  try {
    const user = await editUser(req.auth!, String(req.params.id), parsed.data);
    if (!user) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    fail(res, err, 'patchUser');
  }
}

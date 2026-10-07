import { Request, Response } from 'express';
import { z } from 'zod';
import { login, logout, LoginThrottledError, SchoolInactiveError } from '../services/auth.service';
import { findSchoolById, findSchoolBySlug } from '../repositories/school.repository';
import { findUserInSchool } from '../repositories/user.repository';
import { emailSchema, slugSchema } from '../lib/validation';

const LoginSchema = z.object({
  school: slugSchema,
  email: emailSchema,
  password: z.string().min(1, 'password is required').max(200),
});

export async function postLogin(req: Request, res: Response): Promise<void> {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }

  try {
    const result = await login(parsed.data.school, parsed.data.email, parsed.data.password);
    if (!result) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' });
      return;
    }
    res.json(result);
  } catch (err) {
    if (err instanceof LoginThrottledError) {
      res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many failed attempts. Try again in 15 minutes.' });
    } else if (err instanceof SchoolInactiveError) {
      res.status(403).json({ error: 'SCHOOL_INACTIVE', message: 'This school account is deactivated' });
    } else {
      console.error('[login]', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  }
}

export async function postLogout(req: Request, res: Response): Promise<void> {
  await logout(req.auth!);
  res.status(204).end();
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const { role, schoolId, userId } = req.auth!;
  const [school, user] = await Promise.all([
    schoolId ? findSchoolById(schoolId) : null,
    userId && schoolId ? findUserInSchool(schoolId, userId) : null,
  ]);
  res.json({
    role,
    school: school ? { id: school.id, name: school.name, slug: school.slug } : null,
    user: user ? { id: user.id, name: user.name, email: user.email } : null,
  });
}

// Public: lets a school's sign-in page show its name. Unknown or inactive → 404.
export async function getPublicSchool(req: Request, res: Response): Promise<void> {
  const school = await findSchoolBySlug(String(req.params.slug));
  if (!school || !school.active) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'School not found' });
    return;
  }
  res.json({ name: school.name });
}

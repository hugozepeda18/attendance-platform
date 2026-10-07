import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { findSchoolById } from '../repositories/school.repository';

const router = Router();

// Who am I? Used by the frontend to show school name + role after sign-in.
router.get('/me', authenticate, async (req: Request, res: Response) => {
  const { role, schoolId } = req.auth!;
  const school = schoolId ? await findSchoolById(schoolId) : null;
  res.json({ role, school: school ? { id: school.id, name: school.name } : null });
});

export default router;

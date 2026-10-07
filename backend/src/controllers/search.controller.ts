import { Request, Response } from 'express';
import { z } from 'zod';
import { searchStudents } from '../services/search.service';

const QuerySchema = z.object({
  query: z.string().min(1, 'query parameter is required'),
});

export async function search(req: Request, res: Response): Promise<void> {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.errors[0].message });
    return;
  }

  try {
    const results = await searchStudents(parsed.data.query);
    res.json({ results });
  } catch (err) {
    console.error('[search]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

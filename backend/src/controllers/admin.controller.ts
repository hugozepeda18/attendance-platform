import { Request, Response } from 'express';
import { z } from 'zod';
import {
  onboardSchool,
  getSchools,
  editSchool,
  getSchoolDetail,
  SlugTakenError,
  issueApiKey,
  getApiKeys,
  revokeKey,
} from '../services/school.service';
import { emailSchema, passwordSchema, slugSchema } from '../lib/validation';

const isTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const configFields = {
  schoolStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'schoolStartTime must be HH:mm'),
  tardyGraceMinutes: z.number().int().min(0).max(240),
  absenceCutoffMinutes: z.number().int().min(0).max(600),
  timezone: z.string().refine(isTimezone, 'timezone must be a valid IANA timezone'),
};

const CreateSchoolSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  slug: slugSchema,
  schoolStartTime: configFields.schoolStartTime.default('08:00'),
  tardyGraceMinutes: configFields.tardyGraceMinutes.default(10),
  absenceCutoffMinutes: configFields.absenceCutoffMinutes.default(30),
  timezone: configFields.timezone.default('America/Mexico_City'),
  principal: z
    .object({ email: emailSchema, name: z.string().trim().min(1, 'principal name is required'), password: passwordSchema })
    .optional(),
});

const UpdateSchoolSchema = z
  .object({
    active: z.boolean().optional(),
    slug: slugSchema.optional(),
    name: z.string().trim().min(1).optional(),
    schoolStartTime: configFields.schoolStartTime.optional(),
    tardyGraceMinutes: configFields.tardyGraceMinutes.optional(),
    absenceCutoffMinutes: configFields.absenceCutoffMinutes.optional(),
    timezone: configFields.timezone.optional(),
    dropLeadingZeros: z.boolean().optional(), // badge "0042" matches roster "42"
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to update');

const IssueKeySchema = z.object({
  role: z.enum(['SCANNER', 'STAFF', 'PRINCIPAL']),
  label: z.string().trim().min(1, 'label is required'),
});

function badInput(res: Response, error: z.ZodError): void {
  res.status(400).json({ error: 'INVALID_INPUT', message: error.errors[0].message });
}

function notFound(res: Response, message = 'School not found'): void {
  res.status(404).json({ error: 'NOT_FOUND', message });
}

function wrap(name: string, fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof SlugTakenError) {
        res.status(409).json({ error: 'SLUG_TAKEN', message: 'Another school already uses this slug' });
        return;
      }
      console.error(`[${name}]`, err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  };
}

export const createSchool = wrap('createSchool', async (req, res) => {
  const parsed = CreateSchoolSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed.error);
  res.status(201).json(await onboardSchool(parsed.data));
});

export const listSchools = wrap('listSchools', async (_req, res) => {
  res.json({ schools: await getSchools() });
});

export const patchSchool = wrap('patchSchool', async (req, res) => {
  const parsed = UpdateSchoolSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed.error);
  const { active, slug, name, ...config } = parsed.data;
  const school = await editSchool(String(req.params.id), { active, slug, name, config });
  if (!school) return notFound(res);
  res.json(school);
});

export const getSchool = wrap('getSchool', async (req, res) => {
  const school = await getSchoolDetail(String(req.params.id));
  if (!school) return notFound(res);
  res.json(school);
});

export const createKey = wrap('createKey', async (req, res) => {
  const parsed = IssueKeySchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed.error);
  const key = await issueApiKey(String(req.params.id), parsed.data.role, parsed.data.label);
  if (!key) return notFound(res);
  res.status(201).json(key);
});

export const listKeys = wrap('listKeys', async (req, res) => {
  const keys = await getApiKeys(String(req.params.id));
  if (!keys) return notFound(res);
  res.json({ keys });
});

export const deleteKey = wrap('deleteKey', async (req, res) => {
  const revoked = await revokeKey(String(req.params.id), String(req.params.keyId));
  if (!revoked) return notFound(res, 'Active key not found');
  res.status(204).end();
});

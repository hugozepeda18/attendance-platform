import { UpdatedByRole } from '@prisma/client';
import { AuthContext } from './auth.service';
import { evaluateStatus, getDateInTimezone } from './attendance.service';
import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import { findStudentById } from '../repositories/student.repository';
import { createExcusedRecords, findRecordsByStudentAndDateRange } from '../repositories/attendance.repository';

export class ExcuseRuleError extends Error {}

const MAX_RANGE_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;
const toDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const toYmd = (d: Date) => d.toISOString().slice(0, 10);

// Office staff or the principal excuse a student before the absence run, so the guardian gets no
// absence notice. Only days without a record are written; existing records are never changed here
// (changing those stays PRINCIPAL-only via PATCH /attendance/record/:id).
export async function excuseInAdvance(
  auth: AuthContext,
  input: { studentId: string; from: string; to?: string; reason: string },
) {
  const schoolId = auth.schoolId!;
  const student = await findStudentById(schoolId, input.studentId);
  if (!student) return null;

  const config = await getSchoolConfig(schoolId);
  if (!config) throw new Error('School configuration not found');

  const today = getDateInTimezone(config.timezone);
  const from = toDate(input.from);
  const to = toDate(input.to ?? input.from);

  if (to < from) throw new ExcuseRuleError('"to" must be on or after "from"');
  if ((to.getTime() - from.getTime()) / DAY_MS >= MAX_RANGE_DAYS) {
    throw new ExcuseRuleError(`An excuse can cover at most ${MAX_RANGE_DAYS} days`);
  }
  if (from < today) throw new ExcuseRuleError('Past days cannot be excused here; the principal can change those records');
  if (
    from.getTime() === today.getTime() &&
    evaluateStatus(new Date(), config.schoolStartTime, config.tardyGraceMinutes, config.absenceCutoffMinutes, config.timezone) ===
      'OUTSIDE_WINDOW'
  ) {
    throw new ExcuseRuleError("Today's attendance window has closed; the principal can change today's record");
  }

  // ponytail: weekdays only; Phase 18 (school calendar) also skips SEP holidays.
  const days: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d);
  }
  if (days.length === 0) throw new ExcuseRuleError('There are no school days in that range');

  const existing = new Set(
    (await findRecordsByStudentAndDateRange(student.id, from, to)).map((r) => toYmd(r.date)),
  );
  const toCreate = days.filter((d) => !existing.has(toYmd(d)));

  await createExcusedRecords(
    toCreate.map((date) => ({
      studentId: student.id,
      date,
      note: input.reason,
      updatedByRole: auth.role === 'SUPERADMIN' ? UpdatedByRole.SUPERADMIN : (auth.role as UpdatedByRole),
      updatedByUserId: auth.userId ?? null,
    })),
  );

  return {
    excused: toCreate.map(toYmd),
    skipped: days.filter((d) => existing.has(toYmd(d))).map(toYmd), // already had a record (e.g. scanned today)
  };
}

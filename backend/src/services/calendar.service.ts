import { Prisma } from '@prisma/client';
import { NOT_IN_SCHOOL_YEAR, sepNonSchoolDay, SEP_YEARS } from '../calendar/sep';
import { createSchoolDay, deleteSchoolDay, findSchoolDaysBetween } from '../repositories/calendar.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const toYmd = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

export class CalendarRuleError extends Error {}

const WEEKEND = 'Fin de semana';

// Days without classes in [from, to] (dates as stored: UTC midnight of the local day) → reason.
// SEP calendar + the school's own days. School days are absent from the map.
export async function nonSchoolDaysBetween(schoolId: string, from: Date, to: Date): Promise<Map<string, string>> {
  const own = new Map((await findSchoolDaysBetween(schoolId, from, to)).map((d) => [toYmd(d.date), d.label]));
  const result = new Map<string, string>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const ymd = toYmd(new Date(t));
    const reason = sepNonSchoolDay(ymd) ?? own.get(ymd);
    if (reason) result.set(ymd, reason);
  }
  return result;
}

export async function nonSchoolDay(schoolId: string, date: Date): Promise<string | null> {
  return (await nonSchoolDaysBetween(schoolId, date, date)).get(toYmd(date)) ?? null;
}

// The principal's calendar screen: weekday days off from `from` to the end of that school year.
export async function getCalendar(schoolId: string, from: Date) {
  const year = SEP_YEARS.find((y) => toDate(y.end) >= from);
  const to = year ? toDate(year.end) : from;
  const own = await findSchoolDaysBetween(schoolId, from, to);
  const days = [...(await nonSchoolDaysBetween(schoolId, from, to))]
    .filter(([, reason]) => reason !== WEEKEND && reason !== NOT_IN_SCHOOL_YEAR)
    .map(([ymd, label]) => {
      const mine = own.find((d) => toYmd(d.date) === ymd);
      return mine ? { date: ymd, label: mine.label, source: 'SCHOOL' as const, id: mine.id } : { date: ymd, label, source: 'SEP' as const };
    });
  return { schoolYear: year?.schoolYear ?? null, start: year?.start ?? null, end: year?.end ?? null, days };
}

// From today on, on a day that would otherwise have classes (past absences are fixed with change requests).
export async function addSchoolDay(schoolId: string, today: Date, ymd: string, label: string) {
  if (toDate(ymd) < today) throw new CalendarRuleError('No se pueden agregar días pasados');
  const already = await nonSchoolDay(schoolId, toDate(ymd));
  if (already) throw new CalendarRuleError(`Ese día ya no hay clases: ${already}`);
  try {
    const day = await createSchoolDay({ schoolId, date: toDate(ymd), label });
    return { id: day.id, date: ymd, label: day.label, source: 'SCHOOL' as const };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new CalendarRuleError('Ese día ya está en el calendario'); // two saves at once
    }
    throw err;
  }
}

export const removeSchoolDay = deleteSchoolDay;

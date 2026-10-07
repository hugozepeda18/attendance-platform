import cron from 'node-cron';
import { SchoolConfig } from '@prisma/client';
import { evaluateAbsences } from '../services/attendance.service';
import { listActiveSchoolConfigs } from '../repositories/school.repository';

type CutoffConfig = Pick<SchoolConfig, 'schoolStartTime' | 'absenceCutoffMinutes' | 'timezone'>;

// True when `now`, in the school's timezone, is a weekday at exactly start + cutoff (HH:mm).
export function isAbsenceCutoffNow(config: CutoffConfig, now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;

  if (get('weekday') === 'Sat' || get('weekday') === 'Sun') return false;

  const [startHour, startMinute] = config.schoolStartTime.split(':').map(Number);
  const cutoff = startHour * 60 + startMinute + config.absenceCutoffMinutes;
  const local = (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10);
  return local === cutoff;
}

// One tick: re-reads schools from the DB every time, so new schools, edited settings and
// deactivations take effect on the next minute without a restart.
export async function runAbsenceTick(
  now: Date = new Date(),
  evaluate: (schoolId: string) => Promise<unknown> = evaluateAbsences,
): Promise<string[]> {
  const due = (await listActiveSchoolConfigs()).filter((c) => isAbsenceCutoffNow(c, now));
  for (const config of due) {
    try {
      await evaluate(config.schoolId);
    } catch (err) {
      console.error(`[AbsenceJob] ${config.schoolId}: error during evaluation:`, err);
    }
  }
  return due.map((c) => c.schoolId);
}

// ponytail: a tick missed while the server is down is not replayed. If that matters,
// run schools whose cutoff passed today but have no ABSENT run recorded.
export function scheduleAbsenceJob(): void {
  cron.schedule('* * * * *', () => {
    runAbsenceTick().catch((err) => console.error('[AbsenceJob] tick failed:', err));
  });
  console.log('[AbsenceJob] Checking every minute for schools reaching their absence cutoff');
}

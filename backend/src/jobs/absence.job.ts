import cron from 'node-cron';
import { SchoolConfig } from '@prisma/client';
import { evaluateAbsences, getDateInTimezone } from '../services/attendance.service';
import { findRecentScannerKeys, listActiveSchoolConfigs } from '../repositories/school.repository';
import { markAbsenceRun } from '../repositories/schoolConfig.repository';
import { alertPrincipal } from '../services/outbox.service';

type CutoffConfig = Pick<SchoolConfig, 'schoolStartTime' | 'absenceCutoffMinutes' | 'timezone'>;

export const MAX_GATE_WAIT_MINUTES = 30;
const GATE_OFFLINE_MS = 2 * 60_000; // heartbeats come every minute
// ponytail: a gate counts if it talked to the server in the last 7 days (covers weekends);
// a retired gate PC delays the run every day until its key is revoked.
const GATE_RECENT_MS = 7 * 24 * 60 * 60_000;

// Minutes since start + cutoff in the school's local time (negative before it); null on weekends.
export function minutesPastCutoff(config: CutoffConfig, now: Date): number | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;

  if (get('weekday') === 'Sat' || get('weekday') === 'Sun') return null;

  const [startHour, startMinute] = config.schoolStartTime.split(':').map(Number);
  const cutoff = startHour * 60 + startMinute + config.absenceCutoffMinutes;
  const local = (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10);
  return local - cutoff;
}

// Gates that are offline or still hold queued scans could turn an arrival into a false absence notice.
export async function gatesNotReady(schoolId: string, now: Date): Promise<string[]> {
  const gates = await findRecentScannerKeys(schoolId, new Date(now.getTime() - GATE_RECENT_MS));
  return gates
    .filter((g) => g.pendingScans > 0 || now.getTime() - g.lastSeenAt!.getTime() > GATE_OFFLINE_MS)
    .map((g) => g.label);
}

// One tick: re-reads schools from the DB every time, so new schools, edited settings and
// deactivations take effect on the next minute without a restart. A school runs once per day,
// from its cutoff on, as soon as its gates are synced (at the latest MAX_GATE_WAIT_MINUTES later).
export async function runAbsenceTick(
  now: Date = new Date(),
  evaluate: (schoolId: string) => Promise<unknown> = evaluateAbsences,
): Promise<string[]> {
  const ran: string[] = [];
  for (const config of await listActiveSchoolConfigs()) {
    const late = minutesPastCutoff(config, now);
    if (late === null || late < 0 || late > MAX_GATE_WAIT_MINUTES) continue;
    const today = getDateInTimezone(config.timezone, now);
    if (config.absenceRunOn?.getTime() === today.getTime()) continue;

    try {
      if (late < MAX_GATE_WAIT_MINUTES) {
        const waiting = await gatesNotReady(config.schoolId, now);
        if (waiting.length) {
          if (late === 0) {
            console.warn(`[AbsenceJob] ${config.schoolId}: waiting for gates ${waiting.join(', ')}`);
            await alertPrincipal(config.schoolId, 'escaner_en_espera', [waiting.join(', ')]);
          }
          continue;
        }
      }
      await evaluate(config.schoolId);
      await markAbsenceRun(config.schoolId, today);
      ran.push(config.schoolId);
    } catch (err) {
      console.error(`[AbsenceJob] ${config.schoolId}: error during evaluation (retried next minute):`, err);
    }
  }
  return ran;
}

// A tick missed while the server is down is caught up on the next tick within the wait window.
export function scheduleAbsenceJob(): void {
  cron.schedule('* * * * *', () => {
    runAbsenceTick().catch((err) => console.error('[AbsenceJob] tick failed:', err));
  });
  console.log('[AbsenceJob] Checking every minute for schools reaching their absence cutoff');
}

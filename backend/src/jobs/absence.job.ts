import cron from 'node-cron';
import { SchoolConfig } from '@prisma/client';
import { evaluateAbsences } from '../services/attendance.service';
import { listActiveSchoolConfigs } from '../repositories/school.repository';

export function cronExpressionFor(config: Pick<SchoolConfig, 'schoolStartTime' | 'absenceCutoffMinutes'>): string {
  const [startHour, startMinute] = config.schoolStartTime.split(':').map(Number);
  const totalMinutes = startHour * 60 + startMinute + config.absenceCutoffMinutes;
  return `0 ${totalMinutes % 60} ${Math.floor(totalMinutes / 60)} * * 1-5`;
}

// One cron task per active school, each in that school's timezone.
// ponytail: schedules are built at boot only; schools created/edited later need a restart.
// Upgrade path: rebuild schedules on admin changes or on a periodic re-sync.
export async function scheduleAbsenceJob(): Promise<void> {
  const configs = await listActiveSchoolConfigs();
  if (configs.length === 0) console.error('[AbsenceJob] No active schools configured — nothing scheduled');

  for (const config of configs) {
    const expression = cronExpressionFor(config);
    console.log(`[AbsenceJob] ${config.schoolId}: scheduled (${expression}) [${config.timezone}]`);

    cron.schedule(
      expression,
      async () => {
        try {
          await evaluateAbsences(config.schoolId);
        } catch (err) {
          console.error(`[AbsenceJob] ${config.schoolId}: error during evaluation:`, err);
        }
      },
      { timezone: config.timezone },
    );
  }
}

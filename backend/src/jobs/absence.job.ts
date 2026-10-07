import cron from 'node-cron';
import { evaluateAbsences } from '../services/attendance.service';
import { getSchoolConfig } from '../repositories/schoolConfig.repository';

export async function scheduleAbsenceJob(): Promise<void> {
  const config = await getSchoolConfig();
  if (!config) {
    console.error('[AbsenceJob] School configuration not found — job not scheduled');
    return;
  }

  const [startHour, startMinute] = config.schoolStartTime.split(':').map(Number);
  const totalMinutes = startHour * 60 + startMinute + config.absenceCutoffMinutes;
  const jobHour = Math.floor(totalMinutes / 60);
  const jobMinute = totalMinutes % 60;

  const expression = `0 ${jobMinute} ${jobHour} * * 1-5`;
  const label = `${String(jobHour).padStart(2, '0')}:${String(jobMinute).padStart(2, '0')}`;

  console.log(`[AbsenceJob] Scheduled at ${label} on weekdays (${expression}) [${config.timezone}]`);

  cron.schedule(
    expression,
    async () => {
      console.log('[AbsenceJob] Running absence evaluation...');
      try {
        await evaluateAbsences();
      } catch (err) {
        console.error('[AbsenceJob] Error during evaluation:', err);
      }
    },
    { timezone: config.timezone },
  );
}

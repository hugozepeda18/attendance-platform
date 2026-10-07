import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import { listRosterForGate } from '../repositories/student.repository';

// Minutes east of UTC for `timezone` at `at` (e.g. Mexico City → -360). The gate refreshes hourly, so DST changes reach it.
export function utcOffsetMinutes(timezone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')!.value; // "GMT-06:00", or "GMT" for UTC
  const m = /([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// Everything the gate needs to show PRESENT / TARDY / unknown / out of hours without the internet.
// The server stays authoritative: the gate still uploads every scan.
export async function getGateRoster(schoolId: string) {
  const [config, students] = await Promise.all([getSchoolConfig(schoolId), listRosterForGate(schoolId)]);
  if (!config) throw new Error(`School ${schoolId} has no config`);
  const now = new Date();
  return {
    serverTime: now.toISOString(),
    utcOffsetMinutes: utcOffsetMinutes(config.timezone, now),
    schoolStartTime: config.schoolStartTime,
    tardyGraceMinutes: config.tardyGraceMinutes,
    absenceCutoffMinutes: config.absenceCutoffMinutes,
    dropLeadingZeros: config.dropLeadingZeros,
    students: students.map((s) => ({
      credentialUid: s.credentialUid,
      name: `${s.firstName} ${s.lastName}`,
      grade: s.grade,
      group: s.group,
    })),
  };
}

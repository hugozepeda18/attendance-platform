import cron from 'node-cron';
import { cronExpressionFor, scheduleAbsenceJob } from '../../src/jobs/absence.job';
import * as schoolRepo from '../../src/repositories/school.repository';

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

describe('cronExpressionFor', () => {
  it('fires at start time + cutoff on weekdays', () => {
    expect(cronExpressionFor({ schoolStartTime: '08:00', absenceCutoffMinutes: 30 })).toBe('0 30 8 * * 1-5');
    expect(cronExpressionFor({ schoolStartTime: '07:45', absenceCutoffMinutes: 30 })).toBe('0 15 8 * * 1-5');
  });
});

describe('scheduleAbsenceJob', () => {
  it('schedules one task per active school in its own timezone', async () => {
    jest.spyOn(schoolRepo, 'listActiveSchoolConfigs').mockResolvedValue([
      { id: '1', schoolId: 'a', schoolStartTime: '08:00', tardyGraceMinutes: 10, absenceCutoffMinutes: 30, timezone: 'America/Mexico_City' },
      { id: '2', schoolId: 'b', schoolStartTime: '07:00', tardyGraceMinutes: 10, absenceCutoffMinutes: 45, timezone: 'America/Tijuana' },
    ]);

    await scheduleAbsenceJob();

    const calls = (cron.schedule as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('0 30 8 * * 1-5');
    expect(calls[0][2]).toEqual({ timezone: 'America/Mexico_City' });
    expect(calls[1][0]).toBe('0 45 7 * * 1-5');
    expect(calls[1][2]).toEqual({ timezone: 'America/Tijuana' });
  });
});

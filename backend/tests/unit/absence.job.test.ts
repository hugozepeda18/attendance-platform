import { minutesPastCutoff } from '../../src/jobs/absence.job';

const mx = { schoolStartTime: '08:00', absenceCutoffMinutes: 30, timezone: 'America/Mexico_City' };

describe('minutesPastCutoff', () => {
  // 2026-10-06 is a Tuesday. Mexico City is UTC-6 (no DST).
  it('is 0 at exactly start + cutoff in the school timezone', () => {
    expect(minutesPastCutoff(mx, new Date('2026-10-06T14:30:00Z'))).toBe(0);
    expect(minutesPastCutoff(mx, new Date('2026-10-06T14:30:59Z'))).toBe(0);
  });

  it('counts minutes before and after', () => {
    expect(minutesPastCutoff(mx, new Date('2026-10-06T14:29:00Z'))).toBe(-1);
    expect(minutesPastCutoff(mx, new Date('2026-10-06T14:31:00Z'))).toBe(1);
  });

  it('respects each school timezone', () => {
    const tijuana = { ...mx, timezone: 'America/Tijuana' }; // UTC-7 in October (PDT)
    expect(minutesPastCutoff(tijuana, new Date('2026-10-06T15:30:00Z'))).toBe(0);
    expect(minutesPastCutoff(tijuana, new Date('2026-10-06T14:30:00Z'))).toBe(-60);
  });

  it('handles cutoffs that cross the hour (07:45 + 30 = 08:15)', () => {
    expect(minutesPastCutoff({ ...mx, schoolStartTime: '07:45' }, new Date('2026-10-06T14:15:00Z'))).toBe(0);
  });

  it('skips weekends', () => {
    expect(minutesPastCutoff(mx, new Date('2026-10-10T14:30:00Z'))).toBeNull(); // Saturday
    expect(minutesPastCutoff(mx, new Date('2026-10-11T14:30:00Z'))).toBeNull(); // Sunday
  });
});

import { isAbsenceCutoffNow } from '../../src/jobs/absence.job';

const mx = { schoolStartTime: '08:00', absenceCutoffMinutes: 30, timezone: 'America/Mexico_City' };

describe('isAbsenceCutoffNow', () => {
  // 2026-10-06 is a Tuesday. Mexico City is UTC-6 (no DST).
  it('is true at exactly start + cutoff in the school timezone', () => {
    expect(isAbsenceCutoffNow(mx, new Date('2026-10-06T14:30:00Z'))).toBe(true);
    expect(isAbsenceCutoffNow(mx, new Date('2026-10-06T14:30:59Z'))).toBe(true);
  });

  it('is false one minute before or after', () => {
    expect(isAbsenceCutoffNow(mx, new Date('2026-10-06T14:29:00Z'))).toBe(false);
    expect(isAbsenceCutoffNow(mx, new Date('2026-10-06T14:31:00Z'))).toBe(false);
  });

  it('respects each school timezone', () => {
    const tijuana = { ...mx, timezone: 'America/Tijuana' }; // UTC-7 in October (PDT)
    expect(isAbsenceCutoffNow(tijuana, new Date('2026-10-06T15:30:00Z'))).toBe(true);
    expect(isAbsenceCutoffNow(tijuana, new Date('2026-10-06T14:30:00Z'))).toBe(false);
  });

  it('handles cutoffs that cross the hour (07:45 + 30 = 08:15)', () => {
    expect(isAbsenceCutoffNow({ ...mx, schoolStartTime: '07:45' }, new Date('2026-10-06T14:15:00Z'))).toBe(true);
  });

  it('skips weekends', () => {
    expect(isAbsenceCutoffNow(mx, new Date('2026-10-10T14:30:00Z'))).toBe(false); // Saturday
    expect(isAbsenceCutoffNow(mx, new Date('2026-10-11T14:30:00Z'))).toBe(false); // Sunday
  });
});

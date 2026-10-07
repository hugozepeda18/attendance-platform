import { evaluateStatus, getDateInTimezone } from '../../src/services/attendance.service';

const TZ = 'America/Mexico_City'; // UTC-6 (permanent, no DST since 2022)
const START = '08:00';
const GRACE = 10;
const CUTOFF = 60; // safe-time window: absent from 09:00

// Helper: build a UTC Date that equals a specific local clock time in Mexico City (UTC-6)
function mxTime(dateStr: string, localHH: number, localMM: number): Date {
  const utcHour = localHH + 6; // UTC = local + 6 (UTC-6)
  const hh = String(utcHour).padStart(2, '0');
  const mm = String(localMM).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00.000Z`);
}

describe('evaluateStatus', () => {
  it('marks PRESENT when scan is before school start', () => {
    // 07:55 MX
    expect(evaluateStatus(mxTime('2026-09-09', 7, 55), START, GRACE, CUTOFF, TZ)).toBe('PRESENT');
  });

  it('marks PRESENT when scan is exactly at school start', () => {
    // 08:00 MX
    expect(evaluateStatus(mxTime('2026-09-09', 8, 0), START, GRACE, CUTOFF, TZ)).toBe('PRESENT');
  });

  it('marks PRESENT when scan is exactly at grace period end', () => {
    // 08:10 MX — last allowed minute
    expect(evaluateStatus(mxTime('2026-09-09', 8, 10), START, GRACE, CUTOFF, TZ)).toBe('PRESENT');
  });

  it('marks TARDY when scan is one minute past grace', () => {
    // 08:11 MX
    expect(evaluateStatus(mxTime('2026-09-09', 8, 11), START, GRACE, CUTOFF, TZ)).toBe('TARDY');
  });

  it('marks TARDY until the last minute of the window', () => {
    // 08:59 MX
    expect(evaluateStatus(mxTime('2026-09-09', 8, 59), START, GRACE, CUTOFF, TZ)).toBe('TARDY');
  });

  it('is OUTSIDE_WINDOW from the cutoff on (absence run time)', () => {
    expect(evaluateStatus(mxTime('2026-09-09', 9, 0), START, GRACE, CUTOFF, TZ)).toBe('OUTSIDE_WINDOW');
    expect(evaluateStatus(mxTime('2026-09-09', 13, 0), START, GRACE, CUTOFF, TZ)).toBe('OUTSIDE_WINDOW');
  });

  it('with no grace, any minute late is TARDY', () => {
    expect(evaluateStatus(mxTime('2026-09-09', 8, 0), START, 0, CUTOFF, TZ)).toBe('PRESENT');
    expect(evaluateStatus(mxTime('2026-09-09', 8, 1), START, 0, CUTOFF, TZ)).toBe('TARDY');
  });

  it('the cutoff wins over a misconfigured grace longer than the window', () => {
    expect(evaluateStatus(mxTime('2026-09-09', 8, 45), START, 90, 30, TZ)).toBe('OUTSIDE_WINDOW');
  });
});

describe('getDateInTimezone', () => {
  it('returns midnight UTC representing the local date in the timezone', () => {
    // 08:00 UTC = 02:00 MX (UTC-6) → MX date is still Sep 9 → midnight UTC Sep 9
    const result = getDateInTimezone(TZ, mxTime('2026-09-09', 8, 0));
    expect(result.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });

  it('handles late-night edge: 23:00 MX is still the same calendar day', () => {
    // 23:00 MX = 05:00 UTC next day → but calendar date in MX is still Sep 9
    const lateNightMX = new Date('2026-09-10T05:00:00.000Z'); // UTC next day, but MX = Sep 9 23:00
    const result = getDateInTimezone(TZ, lateNightMX);
    expect(result.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });
});

import { NOT_IN_SCHOOL_YEAR, SEP_YEARS, sepNonSchoolDay } from '../../src/calendar/sep';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('SEP calendar', () => {
  // Guards the transcription from the DOF image: the Acuerdo states the number of school days.
  it.each(SEP_YEARS)('$schoolYear has the official number of school days', (year) => {
    let schoolDays = 0;
    for (let t = Date.parse(`${year.start}T00:00:00Z`); t <= Date.parse(`${year.end}T00:00:00Z`); t += DAY_MS) {
      if (sepNonSchoolDay(new Date(t).toISOString().slice(0, 10)) === null) schoolDays++;
    }
    expect(schoolDays).toBe(year.officialDays);
  });

  it('names why there are no classes', () => {
    expect(sepNonSchoolDay('2026-10-06')).toBeNull(); // a Tuesday with classes
    expect(sepNonSchoolDay('2026-09-16')).toMatch(/Independencia/);
    expect(sepNonSchoolDay('2026-09-25')).toBe('Consejo Técnico Escolar');
    expect(sepNonSchoolDay('2026-12-23')).toBe('Vacaciones de invierno');
    expect(sepNonSchoolDay('2027-01-06')).toMatch(/Reyes/);
    expect(sepNonSchoolDay('2027-01-07')).toBeNull(); // back after the winter break
    expect(sepNonSchoolDay('2026-10-10')).toBe('Fin de semana');
    expect(sepNonSchoolDay('2026-08-28')).toBe(NOT_IN_SCHOOL_YEAR);
    expect(sepNonSchoolDay('2027-07-12')).toBe(NOT_IN_SCHOOL_YEAR);
  });
});

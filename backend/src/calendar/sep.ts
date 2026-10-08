// SEP school calendar for educación básica (preescolar, primaria, secundaria), one entry per school year.
//
// 2026-2027 source: "ACUERDO número 07/07/26 por el que se establecen los calendarios escolares para el ciclo
// lectivo 2026-2027", Diario Oficial de la Federación, 15/07/2026,
// https://dof.gob.mx/nota_detalle.php?codigo=5793645&fecha=15/07/2026 (the calendar is the image in the Acuerdo).
// Transcribed day by day from that image; tests/unit/calendar.test.ts checks the official total of 185 days.
//
// Every July, when SEP publishes the next Acuerdo in the DOF, add the new school year here (the absence run
// stops outside a loaded school year, and the admin dashboard warns 45 days before the last one ends).

export interface SepYear {
  schoolYear: string;
  officialDays: number; // as stated in the Acuerdo; the test recounts it
  start: string; // first day of classes, YYYY-MM-DD
  end: string; // last day of classes
  off: { from: string; to?: string; label: string }[]; // weekdays without classes (weekends are always off)
}

export const SEP_YEARS: SepYear[] = [
  {
    schoolYear: '2026-2027',
    officialDays: 185,
    start: '2026-08-31',
    end: '2027-07-09',
    off: [
      // Suspensión de labores docentes
      { from: '2026-09-16', label: 'Suspensión de labores (Independencia)' },
      { from: '2026-11-02', label: 'Suspensión de labores (Día de Muertos)' },
      { from: '2026-11-16', label: 'Suspensión de labores (Revolución Mexicana)' },
      { from: '2027-01-06', label: 'Suspensión de labores (Día de Reyes)' },
      { from: '2027-02-01', label: 'Suspensión de labores (Constitución)' },
      { from: '2027-03-15', label: 'Suspensión de labores (Natalicio de Benito Juárez)' },
      { from: '2027-05-05', label: 'Suspensión de labores (Batalla de Puebla)' },
      // Consejo Técnico Escolar, sesiones ordinarias
      { from: '2026-09-25', label: 'Consejo Técnico Escolar' },
      { from: '2026-10-30', label: 'Consejo Técnico Escolar' },
      { from: '2026-11-27', label: 'Consejo Técnico Escolar' },
      { from: '2027-01-29', label: 'Consejo Técnico Escolar' },
      { from: '2027-02-26', label: 'Consejo Técnico Escolar' },
      { from: '2027-04-30', label: 'Consejo Técnico Escolar' },
      { from: '2027-05-28', label: 'Consejo Técnico Escolar' },
      { from: '2027-06-25', label: 'Consejo Técnico Escolar' },
      // Registro de calificaciones (no classes: needed for the official 185)
      { from: '2026-11-13', label: 'Registro de calificaciones' },
      { from: '2027-03-05', label: 'Registro de calificaciones' },
      { from: '2027-07-02', label: 'Registro de calificaciones' },
      // Vacaciones (25 Dec and 1 Jan are also suspensiones inside them)
      { from: '2026-12-21', to: '2027-01-05', label: 'Vacaciones de invierno' },
      { from: '2027-03-22', to: '2027-04-02', label: 'Vacaciones de primavera' },
    ],
  },
];

export const NOT_IN_SCHOOL_YEAR = 'Fuera del ciclo escolar';

const isWeekend = (ymd: string) => [0, 6].includes(new Date(`${ymd}T00:00:00Z`).getUTCDay());

// Why there are no classes on `ymd` by the SEP calendar (weekend, holiday, CTE, vacation, outside the
// school year), or null for a school day.
export function sepNonSchoolDay(ymd: string): string | null {
  if (isWeekend(ymd)) return 'Fin de semana';
  const year = SEP_YEARS.find((y) => y.start <= ymd && ymd <= y.end);
  if (!year) return NOT_IN_SCHOOL_YEAR;
  return year.off.find((o) => o.from <= ymd && ymd <= (o.to ?? o.from))?.label ?? null;
}

// Last day covered by the loaded calendars (the dashboard warns when it gets close).
export const sepCalendarUntil = () => SEP_YEARS.map((y) => y.end).sort().at(-1)!;

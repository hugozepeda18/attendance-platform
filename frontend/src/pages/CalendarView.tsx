import { useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { addCalendarDay, deleteCalendarDay, getCalendar } from '../services/calendar';
import type { SchoolCalendar, UserRole } from '../types';
import { T, errorText, fmtDay, fmtMonth } from '../strings';

interface Props {
  role: UserRole;
}

const inputClass = 'px-3 min-h-[44px] rounded-lg border border-slate-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// Days without classes from today to the end of the school year: the SEP calendar plus the school's
// own days. On these days nobody is marked absent and no messages go out.
export default function CalendarView({ role }: Props) {
  const [calendar, setCalendar] = useState<SchoolCalendar | null>(null);
  const [form, setForm] = useState({ date: '', label: '' });
  const [error, setError] = useState<string | null>(null);
  const canEdit = role !== 'STAFF';

  const reload = () => getCalendar().then(setCalendar).catch(() => setError(T.loadFailed));
  useEffect(() => {
    reload();
  }, []);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => addCalendarDay(form.date, form.label.trim()))) setForm({ date: '', label: '' });
  }

  if (!calendar) return <div className="py-20 text-center text-slate-400">{error ?? T.loading}</div>;

  const months = new Map<string, typeof calendar.days>();
  for (const d of calendar.days) months.set(fmtMonth(d.date), [...(months.get(fmtMonth(d.date)) ?? []), d]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Días sin clases</h2>
        <p className="text-sm text-slate-400">
          {calendar.schoolYear
            ? `Ciclo escolar ${calendar.schoolYear} (${fmtDay(calendar.start!)} – ${fmtDay(calendar.end!)}): calendario oficial de la SEP más los días de su escuela. En estos días no se marcan faltas.`
            : 'Aún no está cargado el calendario de la SEP.'}
        </p>
      </div>

      {canEdit && (
        <form onSubmit={add} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-2">
          <input type="date" required aria-label="Fecha" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input required maxLength={100} placeholder="Motivo, p. ej. Suspensión por falta de agua" aria-label="Motivo"
            className={`${inputClass} flex-1`} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <button type="submit" className="px-4 min-h-[44px] rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Agregar día</button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {[...months].map(([month, days]) => (
        <section key={month} className="bg-white rounded-xl border border-slate-200">
          <h3 className="px-4 py-2 border-b border-slate-100 text-sm font-semibold text-slate-600">{month}</h3>
          <ul className="divide-y divide-slate-100">
            {days.map((d) => (
              <li key={d.date} className="px-4 py-2 flex items-center gap-2 sm:gap-3 text-sm">
                <span className="w-24 shrink-0 text-slate-700">{fmtDay(d.date)}</span>
                <span className="flex-1 min-w-0 text-slate-600">{d.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${d.source === 'SEP' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700'}`}>
                  {d.source === 'SEP' ? 'SEP' : 'Escuela'}
                </span>
                {canEdit && d.id && (
                  <button aria-label={`Quitar ${fmtDay(d.date)}`} title="Quitar" onClick={() => run(() => deleteCalendarDay(d.id!))}
                    className="w-11 h-11 -my-2 flex items-center justify-center text-slate-400 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

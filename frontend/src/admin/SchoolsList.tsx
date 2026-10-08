import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { SchoolSummary } from '../types';
import { listSchools } from '../services/admin';
import { primaryButton } from './ui';
import { T, fmtLongDay } from '../strings';

interface Props {
  onOpen: (id: string) => void;
  onNew: () => void;
}

export default function SchoolsList({ onOpen, onNew }: Props) {
  const [schools, setSchools] = useState<SchoolSummary[] | null>(null);
  const [calendarUntil, setCalendarUntil] = useState<string | null>(null);
  // The absence run stops outside a loaded SEP school year: remind the owner to add the next one.
  const calendarEndsSoon = calendarUntil !== null && Date.parse(calendarUntil) - Date.now() < 45 * 24 * 60 * 60 * 1000;
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    listSchools()
      .then((r) => {
        setSchools(r.schools);
        setCalendarUntil(r.sepCalendarUntil);
      })
      .catch(() => setError(T.loadFailed));
  }, []);

  const q = query.trim().toLowerCase();
  const visible = (schools ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.slug.includes(q));

  return (
    <div className="space-y-4">
      {calendarEndsSoon && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El calendario de la SEP cargado termina el <strong>{fmtLongDay(calendarUntil!)}</strong>. Agregue el siguiente ciclo escolar del DOF
          (<code>backend/src/calendar/sep.ts</code>); después de esa fecha no se marcarán faltas.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Escuelas {schools && <span className="text-slate-400 font-normal">({schools.length})</span>}</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Buscar escuelas"
              placeholder="Buscar nombre o dirección"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 min-h-[44px] rounded-lg border border-slate-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={onNew} className={`${primaryButton} flex items-center gap-1.5 shrink-0`}>
            <Plus size={15} /> Nueva escuela
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {schools === null && !error && <p className="py-8 text-center text-slate-400">{T.loading}</p>}
      {schools !== null && visible.length === 0 && <p className="py-8 text-center text-slate-400">Ninguna escuela coincide.</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {visible.map((s) => (
          <li key={s.id}>
            <button onClick={() => onOpen(s.id)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-400 space-y-1">
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium text-slate-800">{s.name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${s.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {s.active ? T.active : T.inactive}
                </span>
              </span>
              <span className="block text-sm text-slate-500">
                <span className="font-mono text-xs">{s.slug}</span> · {s.studentCount} alumnos · {s.timezone ?? '—'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

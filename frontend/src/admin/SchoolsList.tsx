import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { SchoolSummary } from '../types';
import { listSchools } from '../services/admin';
import { primaryButton } from './ui';

interface Props {
  onOpen: (id: string) => void;
  onNew: () => void;
}

export default function SchoolsList({ onOpen, onNew }: Props) {
  const [schools, setSchools] = useState<SchoolSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    listSchools().then(setSchools).catch(() => setError('Failed to load schools.'));
  }, []);

  const q = query.trim().toLowerCase();
  const visible = (schools ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.slug.includes(q));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Schools {schools && <span className="text-slate-400 font-normal">({schools.length})</span>}</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search schools"
              placeholder="Search name or address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={onNew} className={`${primaryButton} flex items-center gap-1.5 shrink-0`}>
            <Plus size={15} /> New school
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">School</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3 hidden md:table-cell">Timezone</th>
              <th className="px-4 py-3 text-right">Students</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {schools === null && !error && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {schools !== null && visible.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No schools match.</td></tr>
            )}
            {visible.map((s) => (
              <tr key={s.id} onClick={() => onOpen(s.id)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3 font-medium text-slate-800">
                  <button className="text-left hover:text-blue-700" onClick={() => onOpen(s.id)}>{s.name}</button>
                </td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.slug}</td>
                <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{s.timezone ?? '—'}</td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{s.studentCount}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

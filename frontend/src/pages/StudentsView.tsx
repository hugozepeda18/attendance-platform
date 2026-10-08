import { useEffect, useState, type FormEvent } from 'react';
import { createStudent, listStudents, updateStudent, type StudentInput } from '../services/students';
import type { RosterStudent } from '../types';
import { T, errorText } from '../strings';

interface Props {
  onChanged: () => void; // groups may have changed
}

const inputClass = 'px-3 min-h-[44px] rounded-lg border border-slate-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const button = 'min-h-[44px] px-4 rounded-lg text-sm font-medium';
const EMPTY: StudentInput = { firstName: '', lastName: '', grade: 1, group: 'A', credentialUid: '', guardianName: '', guardianWhatsApp: '+52' };

// Principal: add, edit and withdraw students. Withdrawn students stay listed so they can come back.
export default function StudentsView({ onChanged }: Props) {
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [grade, setGrade] = useState<number | ''>('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<StudentInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const reload = () => listStudents(grade || undefined).then(setStudents).catch(() => setError(T.loadFailed));
  useEffect(() => {
    reload();
  }, [grade]);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await reload();
      onChanged();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  function startEdit(s: RosterStudent | null) {
    setError(null);
    setEditing(s ? s.id : 'new');
    setForm(s ? { ...s } : EMPTY);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const { firstName, lastName, grade, group, credentialUid, guardianName, guardianWhatsApp } = form;
    const input = { firstName, lastName, grade, group, credentialUid, guardianName, guardianWhatsApp };
    const ok = await run(
      () => (editing === 'new' ? createStudent(input) : updateStudent(editing!, input)),
    );
    if (ok) setEditing(null);
  }

  const set = (patch: Partial<StudentInput>) => setForm({ ...form, ...patch });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-800">Alumnos</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <select aria-label="Grado" className={`${inputClass} flex-1`} value={grade} onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{T.allGrades}</option>
            {[1, 2, 3].map((g) => <option key={g} value={g}>{T.grade(g)} grado</option>)}
          </select>
          <button onClick={() => startEdit(null)} className={`${button} bg-blue-600 text-white hover:bg-blue-700`}>
            Agregar alumno
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {editing && (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input required placeholder="Nombre(s)" aria-label="Nombre(s)" className={inputClass} value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          <input required placeholder="Apellidos" aria-label="Apellidos" className={inputClass} value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          <div className="flex gap-2">
            <select aria-label="Grado" className={`${inputClass} flex-1`} value={form.grade} onChange={(e) => set({ grade: Number(e.target.value) })}>
              {[1, 2, 3].map((g) => <option key={g} value={g}>{T.grade(g)} grado</option>)}
            </select>
            <input required pattern="[A-Za-z]{1,2}" placeholder="Grupo" aria-label="Grupo" className={`${inputClass} w-20 uppercase`}
              value={form.group} onChange={(e) => set({ group: e.target.value.toUpperCase() })} />
          </div>
          <input required placeholder="Credencial" aria-label="Credencial" className={`${inputClass} font-mono`} value={form.credentialUid} onChange={(e) => set({ credentialUid: e.target.value })} />
          <input required placeholder="Nombre del tutor" aria-label="Nombre del tutor" className={inputClass} value={form.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
          <input required type="tel" pattern="\+\d{10,15}" placeholder="+523312345678" aria-label="WhatsApp del tutor" className={inputClass}
            value={form.guardianWhatsApp} onChange={(e) => set({ guardianWhatsApp: e.target.value.replace(/[\s-]/g, '') })} />
          <div className="flex gap-2 lg:col-span-2">
            <button type="submit" className={`${button} flex-1 bg-blue-600 text-white hover:bg-blue-700`}>
              {editing === 'new' ? T.add : T.save}
            </button>
            <button type="button" onClick={() => setEditing(null)} className={`${button} flex-1 border border-slate-200 text-slate-600`}>
              {T.cancel}
            </button>
          </div>
        </form>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {students.map((s) => (
          <li key={s.id} className={`bg-white rounded-xl border border-slate-200 p-4 space-y-3 ${s.active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{s.lastName}, {s.firstName}{!s.active && ' (baja)'}</p>
                <p className="text-xs text-slate-400 font-mono">{s.credentialUid}</p>
                <p className="text-sm text-slate-500">{s.guardianName} · {s.guardianWhatsApp}</p>
              </div>
              <span className="text-sm font-medium text-slate-600 shrink-0">{s.grade}-{s.group}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => startEdit(s)} className={`${button} border border-slate-300 text-blue-700`}>{T.edit}</button>
              <button
                onClick={() => {
                  if (s.active && !window.confirm(`¿Dar de baja a ${s.firstName} ${s.lastName}? Ya no podrá registrar entrada ni se le marcarán faltas.`)) return;
                  run(() => updateStudent(s.id, { active: !s.active }));
                }}
                className={`${button} border ${s.active ? 'border-red-200 text-red-700' : 'border-green-200 text-green-700'}`}
              >
                {s.active ? 'Dar de baja' : 'Reactivar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

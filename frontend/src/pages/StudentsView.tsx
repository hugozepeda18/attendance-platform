import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { createStudent, listStudents, updateStudent, type StudentInput } from '../services/students';
import type { RosterStudent } from '../types';

interface Props {
  onChanged: () => void; // groups may have changed
}

const inputClass = 'px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const EMPTY: StudentInput = { firstName: '', lastName: '', grade: 1, group: 'A', credentialUid: '', guardianName: '', guardianWhatsApp: '+52' };

function apiMessage(err: unknown, fallback: string): string {
  return (axios.isAxiosError(err) && err.response?.data?.message) || fallback;
}

// Principal: add, edit and withdraw students. Withdrawn students stay listed so they can come back.
export default function StudentsView({ onChanged }: Props) {
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [grade, setGrade] = useState<number | ''>('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<StudentInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const reload = () => listStudents(grade || undefined).then(setStudents).catch(() => setError('Failed to load students.'));
  useEffect(() => {
    reload();
  }, [grade]);

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    try {
      await action();
      await reload();
      onChanged();
      return true;
    } catch (err) {
      setError(apiMessage(err, fallback));
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
      'Could not save the student.',
    );
    if (ok) setEditing(null);
  }

  const set = (patch: Partial<StudentInput>) => setForm({ ...form, ...patch });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-800">Students</h2>
        <div className="flex gap-2">
          <select aria-label="Grade" className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All grades</option>
            {[1, 2, 3].map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </select>
          <button onClick={() => startEdit(null)} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            Add student
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {editing && (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input required placeholder="First name" aria-label="First name" className={inputClass} value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          <input required placeholder="Last name" aria-label="Last name" className={inputClass} value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          <div className="flex gap-2">
            <select aria-label="Grade" className={`${inputClass} flex-1`} value={form.grade} onChange={(e) => set({ grade: Number(e.target.value) })}>
              {[1, 2, 3].map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </select>
            <input required pattern="[A-Za-z]{1,2}" placeholder="Group" aria-label="Group" className={`${inputClass} w-20 uppercase`}
              value={form.group} onChange={(e) => set({ group: e.target.value.toUpperCase() })} />
          </div>
          <input required placeholder="Badge" aria-label="Badge" className={`${inputClass} font-mono`} value={form.credentialUid} onChange={(e) => set({ credentialUid: e.target.value })} />
          <input required placeholder="Guardian name" aria-label="Guardian name" className={inputClass} value={form.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
          <input required type="tel" pattern="\+\d{10,15}" placeholder="+523312345678" aria-label="Guardian WhatsApp" className={inputClass}
            value={form.guardianWhatsApp} onChange={(e) => set({ guardianWhatsApp: e.target.value.replace(/[\s-]/g, '') })} />
          <div className="flex gap-2 lg:col-span-2">
            <button type="submit" className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              {editing === 'new' ? 'Add' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Student</th>
              <th className="px-4 py-2 font-medium">Group</th>
              <th className="px-4 py-2 font-medium hidden sm:table-cell">Guardian</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className={`border-t border-slate-100 ${s.active ? '' : 'opacity-50'}`}>
                <td className="px-4 py-2">
                  <p className="text-slate-800">{s.lastName}, {s.firstName}{!s.active && ' (withdrawn)'}</p>
                  <p className="text-xs text-slate-400 font-mono">{s.credentialUid}</p>
                </td>
                <td className="px-4 py-2 text-slate-600">{s.grade}-{s.group}</td>
                <td className="px-4 py-2 text-slate-600 hidden sm:table-cell">
                  {s.guardianName}
                  <span className="block text-xs text-slate-400">{s.guardianWhatsApp}</span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => startEdit(s)} className="text-blue-600 font-medium">Edit</button>
                    <button
                      onClick={() => {
                        if (s.active && !window.confirm(`Withdraw ${s.firstName} ${s.lastName}? They will no longer be scanned or marked absent.`)) return;
                        run(() => updateStudent(s.id, { active: !s.active }), 'Could not update the student.');
                      }}
                      className={s.active ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}
                    >
                      {s.active ? 'Withdraw' : 'Reactivate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

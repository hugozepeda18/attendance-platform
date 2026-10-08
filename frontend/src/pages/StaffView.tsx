import { useEffect, useState, type FormEvent } from 'react';
import type { PersonRole, SchoolUser } from '../types';
import { createUser, listUsers, updateUser } from '../services/users';
import { ROLE, T, errorText } from '../strings';

interface Props {
  currentUserId: string | null;
  schoolId?: string; // set when the platform admin manages a school's users
}

const inputClass =
  'px-3 min-h-[44px] rounded-lg border border-slate-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const button = 'min-h-[44px] px-4 rounded-lg text-sm font-medium';

// One card per user (stacks on phones); every action is a full-size button.
export default function StaffView({ currentUserId, schoolId }: Props) {
  const [users, setUsers] = useState<SchoolUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'STAFF' as PersonRole, password: '' });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const reload = () => listUsers(schoolId).then(setUsers).catch(() => setError(T.loadFailed));
  useEffect(() => {
    reload();
  }, [schoolId]);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await createUser({ ...form, email: form.email.trim() }, schoolId);
      setForm({ name: '', email: '', role: 'STAFF', password: '' });
    });
  }

  function handleReset(e: FormEvent, id: string) {
    e.preventDefault();
    run(async () => {
      await updateUser(id, { password: newPassword }, schoolId);
      setResetFor(null);
      setNewPassword('');
    });
  }

  return (
    <div className="space-y-4">
      {!schoolId && <h2 className="text-xl font-bold text-slate-800">Personal</h2>}
      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input required placeholder="Nombre completo" aria-label="Nombre completo" className={inputClass}
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required type="email" placeholder={T.email} aria-label={T.email} className={inputClass}
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select aria-label={T.role} className={inputClass}
          value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as PersonRole })}>
          <option value="STAFF">{ROLE.STAFF}</option>
          <option value="PRINCIPAL">{ROLE.PRINCIPAL}</option>
        </select>
        <input required type="password" minLength={10} placeholder="Contraseña inicial (10+)" aria-label="Contraseña inicial"
          autoComplete="new-password" className={inputClass}
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="submit" className={`${button} bg-blue-600 text-white hover:bg-blue-700`}>
          Agregar usuario
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {users.map((u) => (
          <li key={u.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{u.name}</p>
                <p className="text-sm text-slate-500 break-all">{u.email}</p>
              </div>
              <div className="text-right text-sm shrink-0">
                <p className="text-slate-600">{ROLE[u.role]}</p>
                <p className={u.active ? 'text-green-600' : 'text-slate-400'}>{u.active ? T.active : T.inactive}</p>
              </div>
            </div>
            {resetFor === u.id ? (
              <form onSubmit={(e) => handleReset(e, u.id)} className="flex flex-col sm:flex-row gap-2">
                <input required type="password" minLength={10} autoFocus placeholder={T.newPassword} aria-label={T.newPassword}
                  autoComplete="new-password" className={`${inputClass} flex-1`}
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <button type="submit" className={`${button} bg-blue-600 text-white`}>{T.save}</button>
                <button type="button" onClick={() => setResetFor(null)} className={`${button} border border-slate-300 text-slate-600`}>{T.cancel}</button>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setResetFor(u.id); setNewPassword(''); }} className={`${button} border border-slate-300 text-blue-700`}>
                  {T.resetPassword}
                </button>
                {u.id !== currentUserId && (
                  <button
                    onClick={() => run(() => updateUser(u.id, { active: !u.active }, schoolId))}
                    className={`${button} border ${u.active ? 'border-red-200 text-red-700' : 'border-green-200 text-green-700'}`}
                  >
                    {u.active ? T.deactivate : T.activate}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

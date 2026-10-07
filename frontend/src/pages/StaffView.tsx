import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import type { PersonRole, SchoolUser } from '../types';
import { createUser, listUsers, updateUser } from '../services/users';

interface Props {
  currentUserId: string | null;
  schoolId?: string; // set when the platform admin manages a school's users
}

const inputClass =
  'px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function apiMessage(err: unknown, fallback: string): string {
  return (axios.isAxiosError(err) && err.response?.data?.message) || fallback;
}

export default function StaffView({ currentUserId, schoolId }: Props) {
  const [users, setUsers] = useState<SchoolUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'STAFF' as PersonRole, password: '' });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const reload = () => listUsers(schoolId).then(setUsers).catch(() => setError('Failed to load staff.'));
  useEffect(() => {
    reload();
  }, [schoolId]);

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(apiMessage(err, fallback));
    }
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await createUser({ ...form, email: form.email.trim() }, schoolId);
      setForm({ name: '', email: '', role: 'STAFF', password: '' });
    }, 'Could not create the user.');
  }

  function handleReset(e: FormEvent, id: string) {
    e.preventDefault();
    run(async () => {
      await updateUser(id, { password: newPassword }, schoolId);
      setResetFor(null);
      setNewPassword('');
    }, 'Could not reset the password.');
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-4 grid gap-3 sm:grid-cols-5">
        <input required placeholder="Full name" aria-label="Full name" className={inputClass}
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required type="email" placeholder="Email" aria-label="Email" className={inputClass}
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select aria-label="Role" className={inputClass}
          value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as PersonRole })}>
          <option value="STAFF">Staff</option>
          <option value="PRINCIPAL">Principal</option>
        </select>
        <input required type="password" minLength={10} placeholder="Initial password (10+)" aria-label="Initial password"
          autoComplete="new-password" className={inputClass}
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="submit" className="py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          Add user
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-800">{u.name}</td>
                <td className="px-4 py-2 text-slate-600">{u.email}</td>
                <td className="px-4 py-2 text-slate-600">{u.role}</td>
                <td className="px-4 py-2">
                  <span className={u.active ? 'text-green-600' : 'text-slate-400'}>{u.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-4 py-2">
                  {resetFor === u.id ? (
                    <form onSubmit={(e) => handleReset(e, u.id)} className="flex gap-2 justify-end">
                      <input required type="password" minLength={10} autoFocus placeholder="New password" aria-label="New password"
                        autoComplete="new-password" className={`${inputClass} py-1`}
                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                      <button type="submit" className="text-blue-600 font-medium">Save</button>
                      <button type="button" onClick={() => setResetFor(null)} className="text-slate-500">Cancel</button>
                    </form>
                  ) : (
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => { setResetFor(u.id); setNewPassword(''); }} className="text-blue-600 font-medium">
                        Reset password
                      </button>
                      {u.id !== currentUserId && (
                        <button
                          onClick={() => run(() => updateUser(u.id, { active: !u.active }, schoolId), 'Could not update the user.')}
                          className={u.active ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

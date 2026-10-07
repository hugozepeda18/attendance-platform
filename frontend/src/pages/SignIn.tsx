import { useState, type FormEvent } from 'react';
import { GraduationCap } from 'lucide-react';
import type { Me } from '../types';
import { getMe } from '../services/auth';
import { setToken, clearToken } from '../services/session';

interface Props {
  onSignedIn: (me: Me) => void;
}

const DASHBOARD_ROLES = ['STAFF', 'PRINCIPAL'];

export default function SignIn({ onSignedIn }: Props) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setToken(key.trim());
    try {
      const me = await getMe();
      if (!DASHBOARD_ROLES.includes(me.role)) {
        clearToken();
        setError(`A ${me.role} key can't open the dashboard. Use a STAFF or PRINCIPAL key.`);
        return;
      }
      onSignedIn(me);
    } catch {
      clearToken();
      setError('That key is invalid, revoked, or the school is deactivated.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-blue-600" size={24} />
          <h1 className="font-bold text-slate-800 text-lg">AttendanceTracker</h1>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Access key</span>
          <input
            type="password"
            required
            autoFocus
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !key.trim()}
          className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

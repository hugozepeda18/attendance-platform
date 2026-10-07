import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { GraduationCap } from 'lucide-react';
import type { Me } from '../types';
import { getMe, getPublicSchool, login } from '../services/auth';
import { schoolSlugFromHost } from '../services/school';
import { setToken, clearToken } from '../services/session';

interface Props {
  onSignedIn: (me: Me) => void;
}

const slug = schoolSlugFromHost();

export default function SignIn({ onSignedIn }: Props) {
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolMissing, setSchoolMissing] = useState(slug === null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getPublicSchool(slug)
      .then((s) => setSchoolName(s.name))
      .catch(() => setSchoolMissing(true));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setError(null);
    setLoading(true);
    try {
      setToken(await login(slug, email.trim(), password));
      onSignedIn(await getMe());
    } catch (err) {
      clearToken();
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 429
          ? 'Too many failed attempts. Try again in 15 minutes.'
          : status === 403
            ? 'This school account is deactivated.'
            : status === 401
              ? 'Incorrect email or password.'
              : 'Could not sign in. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-blue-600 shrink-0" size={24} />
          <h1 className="font-bold text-slate-800 text-lg">{schoolName ?? 'AttendanceTracker'}</h1>
        </div>

        {schoolMissing ? (
          <p className="text-sm text-slate-600">
            School not found. Open your school's own address (for example <code>your-school.example.com</code>).
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || !schoolName}
              className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

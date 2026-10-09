import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { GraduationCap } from 'lucide-react';
import type { Me } from '../types';
import { adminLogin, getMe, getPublicSchool, login } from '../services/auth';
import { schoolSlugFromHost } from '../services/school';
import { setToken, clearToken } from '../services/session';

interface Props {
  onSignedIn: (me: Me) => void;
  admin?: boolean; // platform owner sign-in at admin.<domain>
}

const slug = schoolSlugFromHost();

export default function SignIn({ onSignedIn, admin = false }: Props) {
  const [schoolName, setSchoolName] = useState<string | null>(admin ? 'Administración de la plataforma' : null);
  const [schoolMissing, setSchoolMissing] = useState(!admin && slug === null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (admin || !slug) return;
    getPublicSchool(slug)
      .then((s) => setSchoolName(s.name))
      // Only a 404 means the address is wrong; a down/unreachable server shows up as a sign-in error instead.
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) setSchoolMissing(true);
        else console.error('[SignIn] school lookup failed:', err);
      });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!admin && !slug) return;
    setError(null);
    setLoading(true);
    try {
      if (admin) setToken(await adminLogin(email.trim(), password));
      else setToken(await login(slug!, email.trim(), password, remember), remember);
      onSignedIn(await getMe());
    } catch (err) {
      clearToken();
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 429
          ? 'Demasiados intentos fallidos. Intente de nuevo en 15 minutos.'
          : status === 403
            ? 'La cuenta de esta escuela está desactivada.'
            : status === 401
              ? 'Correo o contraseña incorrectos.'
              : status === undefined
                ? 'No hay conexión con el servidor. Revise su internet.'
                : 'No se pudo iniciar sesión. Intente de nuevo.',
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
          <h1 className="font-bold text-slate-800 text-lg">{schoolName ?? 'Asistencia'}</h1>
        </div>

        {schoolMissing ? (
          <p className="text-sm text-slate-600">
            Escuela no encontrada. Abra la dirección de su escuela (por ejemplo <code>su-escuela.ejemplo.com</code>).
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Correo</span>
              <input
                type="email"
                required
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Contraseña</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            {!admin && (
              <label className="flex items-center gap-3 min-h-[44px] text-sm text-slate-700">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-5 h-5" />
                Recordarme en este teléfono (30 días)
              </label>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || !schoolName}
              className="w-full py-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        )}
        <a href="/privacidad.html" className="flex items-center justify-center min-h-[44px] text-xs text-slate-400 hover:text-slate-600">Aviso de privacidad</a>
      </div>
    </div>
  );
}

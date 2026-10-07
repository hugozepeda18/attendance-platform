import { useEffect, useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import type { Me } from '../types';
import SignIn from '../pages/SignIn';
import { getMe, logout } from '../services/auth';
import { getToken, clearToken } from '../services/session';
import SchoolsList from './SchoolsList';
import NewSchool from './NewSchool';
import SchoolDetail from './SchoolDetail';

type View = { page: 'list' } | { page: 'new' } | { page: 'school'; id: string };

export default function AdminApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(() => getToken() !== null);
  const [view, setView] = useState<View>({ page: 'list' });

  useEffect(() => {
    if (!getToken()) return;
    getMe()
      .then(setMe)
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  function handleSignOut() {
    logout().catch(() => {}).finally(() => {
      clearToken();
      setMe(null);
    });
  }

  if (checking) return <div className="min-h-screen bg-slate-50" />;
  if (me?.role !== 'SUPERADMIN') return <SignIn admin onSignedIn={setMe} />;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <button onClick={() => setView({ page: 'list' })} className="flex items-center gap-2">
            <ShieldCheck className="text-indigo-600" size={24} />
            <span className="font-bold text-slate-800 text-lg">Platform admin</span>
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="hidden sm:inline">{me.user?.name}</span>
            <button
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {view.page === 'list' && (
          <SchoolsList onOpen={(id) => setView({ page: 'school', id })} onNew={() => setView({ page: 'new' })} />
        )}
        {view.page === 'new' && (
          <NewSchool onCancel={() => setView({ page: 'list' })} onDone={(id) => setView({ page: 'school', id })} />
        )}
        {view.page === 'school' && <SchoolDetail id={view.id} onBack={() => setView({ page: 'list' })} />}
      </main>
    </div>
  );
}

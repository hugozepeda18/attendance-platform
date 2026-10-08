import { GraduationCap, Users, LayoutGrid, LogOut, UserCog, Inbox, Contact, CalendarDays } from 'lucide-react';
import type { UserRole, ViewTab } from '../types';
import { ROLE, T } from '../strings';

interface Props {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  role: UserRole;
  schoolName: string;
  userName: string | null;
  onSignOut: () => void;
  pendingRequests: number;
}

const people: UserRole[] = ['STAFF', 'PRINCIPAL', 'SUPERADMIN'];
const principal: UserRole[] = ['PRINCIPAL', 'SUPERADMIN'];
const tabs: { id: ViewTab; label: string; Icon: typeof Users; roles: UserRole[] }[] = [
  { id: 'group', label: 'Grupos', Icon: Users, roles: people },
  { id: 'grade', label: 'Grados', Icon: LayoutGrid, roles: people },
  { id: 'requests', label: 'Solicitudes', Icon: Inbox, roles: people },
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays, roles: people },
  { id: 'students', label: 'Alumnos', Icon: Contact, roles: principal },
  { id: 'staff', label: 'Personal', Icon: UserCog, roles: principal },
];

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-label={`${count} pendientes`} className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] leading-[18px] text-center">
      {count}
    </span>
  );
}

// Desktop: one top bar with every tab. Phone: a compact top bar (school + sign out) and a bottom tab bar.
export default function NavBar({ activeTab, onTabChange, role, schoolName, userName, onSignOut, pendingRequests }: Props) {
  const visible = tabs.filter((t) => t.roles.includes(role));
  return (
    <>
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <GraduationCap className="text-blue-600 shrink-0" size={24} />
            <span className="font-bold text-slate-800 truncate">{schoolName}</span>
          </div>

          <nav className="hidden md:flex items-center bg-slate-100 rounded-lg p-1 gap-1">
            {visible.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                  ${activeTab === id ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icon size={15} />
                {label}
                {id === 'requests' && <Badge count={pendingRequests} />}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            <span className="hidden lg:inline text-sm text-slate-600 mr-1">
              {userName ?? ROLE[role]} · {ROLE[role]}
            </span>
            <button
              onClick={onSignOut}
              title={T.signOut}
              aria-label={T.signOut}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {visible.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`relative flex-1 min-w-0 h-14 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium
              ${activeTab === id ? 'text-blue-700' : 'text-slate-500'}`}
          >
            <Icon size={20} />
            <span className="truncate max-w-full px-0.5">{label}</span>
            {id === 'requests' && (
              <span className="absolute top-1 left-1/2 ml-1.5">
                <Badge count={pendingRequests} />
              </span>
            )}
          </button>
        ))}
      </nav>
    </>
  );
}

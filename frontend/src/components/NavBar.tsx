import { GraduationCap, Users, Shield, User, LogOut, UserCog, Inbox, Contact } from 'lucide-react';
import type { UserRole, ViewTab } from '../types';

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
  { id: 'grade', label: 'By Grade', Icon: GraduationCap, roles: people },
  { id: 'group', label: 'By Group', Icon: Users, roles: people },
  { id: 'requests', label: 'Requests', Icon: Inbox, roles: people },
  { id: 'students', label: 'Students', Icon: Contact, roles: principal },
  { id: 'staff', label: 'Staff', Icon: UserCog, roles: principal },
];

export default function NavBar({ activeTab, onTabChange, role, schoolName, userName, onSignOut, pendingRequests }: Props) {
  return (
    <header className="bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <GraduationCap className="text-blue-600" size={24} />
          <span className="font-bold text-slate-800 text-lg hidden lg:block">
            {schoolName}
          </span>
        </div>

        {/* View toggle (labels hide on phones) */}
        <nav className="flex items-center bg-slate-100 rounded-lg p-1 gap-1 overflow-x-auto">
          {tabs.filter((t) => t.roles.includes(role)).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              title={label}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all shrink-0
                ${activeTab === id ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Icon size={15} />
              <span className="hidden md:inline">{label}</span>
              {id === 'requests' && pendingRequests > 0 && (
                <span aria-label={`${pendingRequests} pending`} className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] leading-[18px] text-center">
                  {pendingRequests}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Signed-in role (from the server) + sign out */}
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium
              ${role === 'PRINCIPAL'
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600'
              }`}
          >
            {role === 'PRINCIPAL' ? <Shield size={15} /> : <User size={15} />}
            <span className="hidden md:inline">{userName ?? role}</span>
          </span>
          <button
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

import { GraduationCap, Users, Shield, User } from 'lucide-react';
import type { UserRole, ViewTab } from '../types';

interface Props {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
}

export default function NavBar({ activeTab, onTabChange, role, onRoleChange }: Props) {
  return (
    <header className="bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <GraduationCap className="text-blue-600" size={24} />
          <span className="font-bold text-slate-800 text-lg hidden sm:block">
            AttendanceTracker
          </span>
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
          <button
            onClick={() => onTabChange('grade')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all
              ${activeTab === 'grade'
                ? 'bg-white shadow text-blue-700'
                : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            <GraduationCap size={15} />
            By Grade
          </button>
          <button
            onClick={() => onTabChange('group')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all
              ${activeTab === 'group'
                ? 'bg-white shadow text-blue-700'
                : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            <Users size={15} />
            By Group
          </button>
        </div>

        {/* Role selector */}
        <button
          onClick={() => onRoleChange(role === 'TEACHER' ? 'PRINCIPAL' : 'TEACHER')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
            ${role === 'PRINCIPAL'
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          title="Toggle role (demo)"
        >
          {role === 'PRINCIPAL' ? <Shield size={15} /> : <User size={15} />}
          {role}
        </button>
      </div>
    </header>
  );
}

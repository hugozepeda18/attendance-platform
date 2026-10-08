import { useEffect, useState } from 'react';
import type { GroupInfo, Me, ViewTab } from './types';
import NavBar from './components/NavBar';
import SearchBar from './components/SearchBar';
import GroupView from './pages/GroupView';
import GradeView from './pages/GradeView';
import Student30DayModal from './components/Student30DayModal';
import SignIn from './pages/SignIn';
import StaffView from './pages/StaffView';
import StudentsView from './pages/StudentsView';
import RequestsView from './pages/RequestsView';
import CalendarView from './pages/CalendarView';
import { listGroups } from './services/students';
import { listChangeRequests } from './services/attendance';
import { getMe, logout } from './services/auth';
import { getToken, clearToken } from './services/session';

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(() => getToken() !== null);
  const [activeTab, setActiveTab] = useState<ViewTab>('group');
  const [selectedGrade, setSelectedGrade] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const isPrincipal = me?.role === 'PRINCIPAL' || me?.role === 'SUPERADMIN';

  // Restore the session on reload
  useEffect(() => {
    if (!getToken()) return;
    getMe()
      .then(setMe)
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  // The school's real groups (Phase 17), reloaded whenever something changes.
  useEffect(() => {
    if (me?.school) listGroups().then(setGroups).catch(() => {});
  }, [me, refreshKey]);

  // The principal's notification: pending requests badge, checked every minute.
  // ponytail: polling; the WhatsApp alert to the principal comes with Phase 15.
  useEffect(() => {
    if (!me?.school || !isPrincipal) return;
    const check = () => listChangeRequests('PENDING').then((r) => setPendingRequests(r.pending ?? 0)).catch(() => {});
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [me, isPrincipal, refreshKey]);

  const gradeGroups = groups.filter((g) => g.grade === selectedGrade).map((g) => g.group);
  // Switching grade: keep the group if that grade has it, else its first group.
  useEffect(() => {
    if (gradeGroups.length && !gradeGroups.includes(selectedGroup)) setSelectedGroup(gradeGroups[0]);
  }, [groups, selectedGrade]);

  function handleSignOut() {
    logout().catch(() => {}).finally(() => {
      clearToken();
      setMe(null);
    });
  }

  function handleGroupSelect(grade: number, group: string) {
    setSelectedGrade(grade);
    setSelectedGroup(group);
    setActiveTab('group');
  }

  if (checking) return <div className="min-h-screen bg-slate-50" />;
  if (!me?.school) return <SignIn onSignedIn={setMe} />;

  const { role } = me;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        role={role}
        schoolName={me.school.name}
        userName={me.user?.name ?? null}
        onSignOut={handleSignOut}
        pendingRequests={pendingRequests}
      />

      {role === 'SUPERADMIN' && (
        <div role="status" className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
            <span><strong>Support mode</strong> · {me.user?.name ?? 'Platform admin'} · changes are recorded as platform support</span>
            <button onClick={handleSignOut} className="font-medium underline shrink-0">Exit</button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {activeTab === 'staff' ? (
          <StaffView currentUserId={me.user?.id ?? null} />
        ) : activeTab === 'students' ? (
          <StudentsView onChanged={() => setRefreshKey((k) => k + 1)} />
        ) : activeTab === 'calendar' ? (
          <CalendarView role={role} />
        ) : activeTab === 'requests' ? (
          <RequestsView role={role} onDecided={() => setRefreshKey((k) => k + 1)} />
        ) : (
          <>
            {/* Search bar */}
            <SearchBar onStudentSelect={setSelectedStudentId} />

            {/* Grade + Group selectors */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1.5">
                {[1, 2, 3].map((g) => (
                  <button
                    key={g}
                    onClick={() => setSelectedGrade(g)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all
                      ${selectedGrade === g
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                      }`}
                  >
                    Grade {g}
                  </button>
                ))}
              </div>

              {activeTab === 'group' && (
                <div className="flex gap-1.5">
                  {gradeGroups.map((g) => (
                    <button
                      key={g}
                      onClick={() => setSelectedGroup(g)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all
                        ${selectedGroup === g
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'
                        }`}
                    >
                      Group {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Main content */}
            {activeTab === 'grade' ? (
              <GradeView grade={selectedGrade} groups={gradeGroups} onGroupSelect={handleGroupSelect} refreshKey={refreshKey} />
            ) : gradeGroups.includes(selectedGroup) ? (
              <GroupView
                grade={selectedGrade}
                group={selectedGroup}
                role={role}
                onStudentSelect={setSelectedStudentId}
                refreshKey={refreshKey}
              />
            ) : (
              <p className="py-20 text-center text-slate-400">No students in grade {selectedGrade} yet.</p>
            )}
          </>
        )}
      </main>

      {/* Student detail modal */}
      {selectedStudentId && (
        <Student30DayModal
          studentId={selectedStudentId}
          role={role}
          onClose={() => setSelectedStudentId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
          refreshKey={refreshKey}
        />
      )}

    </div>
  );
}

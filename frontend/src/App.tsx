import { useState } from 'react';
import type { UserRole, ViewTab } from './types';
import NavBar from './components/NavBar';
import SearchBar from './components/SearchBar';
import GroupView from './pages/GroupView';
import GradeView from './pages/GradeView';
import Student30DayModal from './components/Student30DayModal';

export default function App() {
  const [role, setRole] = useState<UserRole>('TEACHER');
  const [activeTab, setActiveTab] = useState<ViewTab>('group');
  const [selectedGrade, setSelectedGrade] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleGroupSelect(grade: number, group: string) {
    setSelectedGrade(grade);
    setSelectedGroup(group);
    setActiveTab('group');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        role={role}
        onRoleChange={setRole}
      />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
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
              {['A', 'B'].map((g) => (
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
          <GradeView grade={selectedGrade} onGroupSelect={handleGroupSelect} />
        ) : (
          <GroupView
            grade={selectedGrade}
            group={selectedGroup}
            role={role}
            onStudentSelect={setSelectedStudentId}
            refreshKey={refreshKey}
          />
        )}
      </main>

      {/* Student detail modal */}
      {selectedStudentId && (
        <Student30DayModal
          studentId={selectedStudentId}
          role={role}
          onClose={() => setSelectedStudentId(null)}
          refreshKey={refreshKey}
          // Re-fetch group view data after an override completes
        />
      )}

      {/* Invisible refresh trigger: bumped after any override inside the modal */}
      <span
        id="refresh-trigger"
        data-key={refreshKey}
        onClick={() => setRefreshKey((k) => k + 1)}
        className="hidden"
      />
    </div>
  );
}

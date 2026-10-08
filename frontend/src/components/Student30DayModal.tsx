import { useState, useEffect } from 'react';
import { X, Phone, User, AlertTriangle, CalendarCheck, DoorOpen } from 'lucide-react';
import { getStudentAnalytics } from '../services/attendance';
import type { StudentAnalytics, TimelineEntry, AttendanceStatus, UserRole } from '../types';
import StatusBadge from './StatusBadge';
import ChangeModal from './ChangeModal';
import ExcuseForm from './ExcuseForm';

interface Props {
  studentId: string;
  role: UserRole;
  onClose: () => void;
  onChanged: () => void; // a record was created/changed: lets the page behind refresh
  refreshKey: number;
}

interface CalendarDay {
  dateStr: string;
  dayLabel: string;
  entry: TimelineEntry | null;
  dayOff: string | null; // no classes (weekend, SEP, the school's own day)
}

const STATUS_CELL: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-100 text-green-800 border-green-200',
  TARDY: 'bg-amber-100 text-amber-800 border-amber-200',
  ABSENT: 'bg-red-100 text-red-800 border-red-200',
  EXCUSED: 'bg-purple-100 text-purple-800 border-purple-200',
};

function buildCalendar(timeline: TimelineEntry[], daysOff: { date: string; label: string }[]): CalendarDay[] {
  const byDate = Object.fromEntries(timeline.map((e) => [e.date, e]));
  const off = Object.fromEntries(daysOff.map((d) => [d.date, d.label]));
  const days: CalendarDay[] = [];
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
    days.push({
      dateStr,
      dayLabel: d.getDate().toString(),
      entry: byDate[dateStr] ?? null,
      dayOff: off[dateStr] ?? null,
    });
  }
  return days;
}

export default function Student30DayModal({ studentId, role, onClose, onChanged, refreshKey }: Props) {
  const [data, setData] = useState<StudentAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // A day to change: staff request it, the principal applies it. Any past day, recorded or not.
  const [changeDay, setChangeDay] = useState<{ date: string; entry: TimelineEntry | null; initial?: AttendanceStatus } | null>(null);
  const [excusing, setExcusing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const canExcuse = role === 'STAFF' || role === 'PRINCIPAL' || role === 'SUPERADMIN';
  const canChange = canExcuse;
  const verb = role === 'STAFF' ? 'request a change' : 'change it';

  function reload() {
    setIsLoading(true);
    getStudentAnalytics(studentId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }

  useEffect(reload, [studentId, refreshKey]);

  if (!data && !isLoading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <p className="text-red-500">Failed to load student data.</p>
          <button onClick={onClose} className="mt-4 text-sm text-blue-600 underline">
            Close
          </button>
        </div>
      </div>
    );
  }

  const calendar = data ? buildCalendar(data.timeline, data.nonSchoolDays) : [];

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-y-auto pt-16"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-8">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-200">
            <h2 className="font-bold text-slate-800 text-lg">
              {isLoading ? 'Loading…' : `${data!.student.firstName} ${data!.student.lastName}`}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>

          {isLoading ? (
            <div className="px-6 py-12 text-center text-slate-400">Loading student data…</div>
          ) : (
            <>
              {/* Student info */}
              <div className="px-6 py-4 grid grid-cols-2 gap-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <User size={14} className="text-slate-400" />
                  Grade {data!.student.grade} · Group {data!.student.group}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone size={14} className="text-slate-400" />
                  {data!.student.guardianName}
                </div>
                <div className="col-span-2 text-xs text-slate-400">
                  {data!.student.guardianWhatsApp} · {data!.student.credentialUid}
                </div>
              </div>

              {/* Excuse in advance / late arrival */}
              {canExcuse && !excusing && (
                <div className="px-6 py-3 border-b border-slate-200 space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => { setExcusing(true); setNotice(null); }}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
                    >
                      <CalendarCheck size={16} /> Excuse absence
                    </button>
                    <button
                      onClick={() => {
                        const today = calendar[calendar.length - 1];
                        setNotice(null);
                        setChangeDay({ date: today.dateStr, entry: today.entry, initial: 'TARDY' });
                      }}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                    >
                      <DoorOpen size={16} /> Register late arrival
                    </button>
                  </div>
                  {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
                </div>
              )}
              {excusing && (
                <ExcuseForm
                  studentId={studentId}
                  onCancel={() => setExcusing(false)}
                  onDone={(message) => { setExcusing(false); setNotice(message); onChanged(); }}
                />
              )}

              {/* Upcoming excuses */}
              {data!.upcomingExcuses.length > 0 && (
                <div className="px-6 py-3 border-b border-slate-200">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Upcoming excused days</h3>
                  <ul className="space-y-1 text-sm">
                    {data!.upcomingExcuses.map((e) => (
                      <li key={e.id} className="flex justify-between gap-3 text-slate-700">
                        <span>{e.date}</span>
                        <span className="text-slate-500 text-right">{e.note}{e.updatedByName ? ` · ${e.updatedByName}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risk flags */}
              {(data!.isHabituallyTardy || data!.isChronicAbsentee) && (
                <div className="px-6 py-3 flex gap-3 bg-orange-50 border-b border-orange-100">
                  <AlertTriangle size={16} className="text-orange-500 mt-0.5 shrink-0" />
                  <div className="flex gap-2 flex-wrap">
                    {data!.isHabituallyTardy && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                        Habitual Tardy (≥3 in 30 days)
                      </span>
                    )}
                    {data!.isChronicAbsentee && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
                        Chronic Absentee (≥3 in 30 days)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 30-day calendar grid */}
              <div className="px-6 py-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  30-Day Attendance History
                </h3>
                <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
                  {calendar.map((day) => (
                    <div
                      key={day.dateStr}
                      title={`${day.dateStr}: ${day.entry?.status ?? day.dayOff ?? 'No record'}`}
                      className={`relative rounded-lg border p-1.5 text-center
                        ${day.entry
                          ? STATUS_CELL[day.entry.status]
                          : day.dayOff
                            ? 'bg-slate-200 text-slate-400 border-slate-200'
                            : 'bg-slate-50 text-slate-300 border-slate-200'
                        }
                        ${canChange ? 'cursor-pointer hover:opacity-75' : ''}
                      `}
                      onClick={() => {
                        if (canChange) setChangeDay({ date: day.dateStr, entry: day.entry });
                      }}
                    >
                      <p className="text-xs font-semibold leading-none">{day.dayLabel}</p>
                      {day.entry && (
                        <p className="text-[9px] mt-0.5 leading-none opacity-70">
                          {day.entry.status.charAt(0)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  {(['PRESENT', 'TARDY', 'ABSENT', 'EXCUSED'] as AttendanceStatus[]).map((s) => (
                    <span key={s} className="flex items-center gap-1">
                      <span className={`w-3 h-3 rounded ${STATUS_CELL[s].split(' ')[0]}`} />
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </span>
                  ))}
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-slate-50 border border-slate-200" />
                    No record
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-slate-200" />
                    No classes
                  </span>
                </div>

                {canChange && (
                  <p className="mt-2 text-xs text-indigo-500">Click a day to {verb}.</p>
                )}
              </div>

              {/* Timeline list */}
              {data!.timeline.length > 0 && (
                <div className="px-6 pb-5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Records
                  </h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {[...data!.timeline].reverse().map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between text-sm py-1 border-b border-slate-100"
                      >
                        <span className="text-slate-600">
                          {e.date}
                          {e.note && (
                            <span className="block text-xs text-slate-400">
                              {e.note}{e.updatedByName ? ` · ${e.updatedByName}` : ''}
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={e.status} />
                          {canChange && (
                            <button
                              onClick={() => setChangeDay({ date: e.date, entry: e })}
                              className="text-xs text-indigo-600 hover:underline"
                            >
                              {role === 'STAFF' ? 'Request change' : 'Change'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {changeDay && data && (
        <ChangeModal
          studentId={studentId}
          studentName={`${data.student.firstName} ${data.student.lastName}`}
          date={changeDay.date}
          currentStatus={changeDay.entry?.status ?? null}
          initialStatus={changeDay.initial}
          role={role}
          onClose={() => setChangeDay(null)}
          onComplete={(message) => {
            setChangeDay(null);
            setNotice(message);
            onChanged();
          }}
        />
      )}
    </>
  );
}

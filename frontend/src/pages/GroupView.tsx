import { useState, useEffect } from 'react';
import { getGroupAnalytics } from '../services/attendance';
import type { GroupAnalytics } from '../types';
import KPICard from '../components/KPICard';
import AttendanceChart from '../components/AttendanceChart';
import StudentTable from '../components/StudentTable';
import { NO_RECORD, STATUS, T } from '../strings';

interface Props {
  grade: number;
  group: string;
  onStudentSelect: (studentId: string) => void;
  refreshKey: number;
}

const wide = () => window.matchMedia('(min-width: 768px)').matches;

// Phones: one-line counts, the student list (missing first), charts folded under "Ver gráficas".
export default function GroupView({ grade, group, onStudentSelect, refreshKey }: Props) {
  const [data, setData] = useState<GroupAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    getGroupAnalytics(grade, group)
      .then(setData)
      .catch(() => setError(T.loadFailed))
      .finally(() => setIsLoading(false));
  }, [grade, group, refreshKey]);

  if (isLoading) return <div className="py-20 text-center text-slate-400">{T.loading}</div>;
  if (error || !data) return <div className="py-20 text-center text-red-500">{error ?? T.loadFailed}</div>;

  const { today } = data;
  const noRecord = Math.max(0, today.total - today.present - today.tardy - today.absent - today.excused);
  const counts = [
    { label: STATUS.PRESENT, value: today.present, color: 'green', text: 'text-green-700' },
    { label: STATUS.TARDY, value: today.tardy, color: 'amber', text: 'text-amber-700' },
    { label: 'Faltas', value: today.absent, color: 'red', text: 'text-red-700' },
    { label: NO_RECORD, value: noRecord, color: 'slate', text: 'text-slate-600' },
  ] as const;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Grupo {T.gradeGroup(data.grade, data.group)}</h2>
        <p className="text-sm text-slate-400">Asistencia de hoy · {today.total} alumnos</p>
      </div>

      {today.nonSchoolDay && (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          Hoy no hay clases: <strong>{today.nonSchoolDay}</strong>. No se marcan faltas ni se envían mensajes.
        </p>
      )}

      {/* Phone: one compact line */}
      <div className="md:hidden grid grid-cols-4 rounded-xl border border-slate-200 bg-white divide-x divide-slate-100 text-center">
        {counts.map((c) => (
          <div key={c.label} className="py-2">
            <p className={`text-xl font-bold ${c.text}`}>{c.value}</p>
            <p className="text-[11px] text-slate-500 leading-tight">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="hidden md:grid grid-cols-5 gap-3">
        <KPICard label="Total" value={today.total} color="slate" />
        {counts.map((c) => (
          <KPICard key={c.label} label={c.label} value={c.value} color={c.color}
            sub={c.label === NO_RECORD ? (today.nonSchoolDay ? 'hoy no hay clases' : 'aún sin evaluar') : undefined} />
        ))}
      </div>

      <div className="flex flex-col gap-4 md:gap-6">
        <div className="order-1 md:order-2">
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Alumnos ({data.students.length})</h3>
          <StudentTable students={data.students} onStudentClick={onStudentSelect} />
        </div>
        <details open={wide()} className="order-2 md:order-1 group">
          <summary className="md:hidden min-h-[44px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 cursor-pointer list-none">
            <span className="group-open:hidden">Ver gráficas</span>
            <span className="hidden group-open:inline">Ocultar gráficas</span>
          </summary>
          <div className="mt-3 md:mt-0">
            <AttendanceChart today={today} thirtyDayRate={data.thirtyDayRate} />
          </div>
        </details>
      </div>
    </div>
  );
}

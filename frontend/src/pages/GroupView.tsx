import { useState, useEffect } from 'react';
import { getGroupAnalytics } from '../services/attendance';
import type { GroupAnalytics, UserRole } from '../types';
import KPICard from '../components/KPICard';
import AttendanceChart from '../components/AttendanceChart';
import StudentTable from '../components/StudentTable';

interface Props {
  grade: number;
  group: string;
  role: UserRole;
  onStudentSelect: (studentId: string) => void;
  refreshKey: number;
}

export default function GroupView({ grade, group, role, onStudentSelect, refreshKey }: Props) {
  const [data, setData] = useState<GroupAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    getGroupAnalytics(grade, group)
      .then(setData)
      .catch(() => setError('Failed to load group data.'))
      .finally(() => setIsLoading(false));
  }, [grade, group, refreshKey]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        Loading group {grade}-{group}…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-red-400">
        {error ?? 'No data available for this group.'}
      </div>
    );
  }

  const noRecord = data.today.total - data.today.present - data.today.tardy - data.today.absent - data.today.excused;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">
          Grade {data.grade} · Group {data.group}
        </h2>
        <p className="text-sm text-slate-400">Today's attendance summary</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard label="Total" value={data.today.total} color="slate" />
        <KPICard label="Present" value={data.today.present} color="green" />
        <KPICard label="Tardy" value={data.today.tardy} color="amber" />
        <KPICard label="Absent" value={data.today.absent} color="red" />
        <KPICard
          label="No Record"
          value={noRecord > 0 ? noRecord : 0}
          color="slate"
          sub="not yet evaluated"
        />
      </div>

      {/* Charts */}
      <AttendanceChart today={data.today} thirtyDayRate={data.thirtyDayRate} />

      {/* Student table */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">
          Students ({data.students.length})
        </h3>
        <StudentTable
          students={data.students}
          role={role}
          onStudentClick={onStudentSelect}
        />
      </div>
    </div>
  );
}

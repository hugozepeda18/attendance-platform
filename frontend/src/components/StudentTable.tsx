import type { GroupStudent, UserRole } from '../types';
import StatusBadge from './StatusBadge';

interface Props {
  students: GroupStudent[];
  role: UserRole;
  onStudentClick: (studentId: string) => void;
}

export default function StudentTable({ students, role: _role, onStudentClick }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Student
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Today
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">
              Present
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">
              Tardy
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">
              Absent
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Flags
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {students.map((s) => (
            <tr
              key={s.id}
              onClick={() => onStudentClick(s.id)}
              className="hover:bg-blue-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{s.name}</p>
                <p className="text-xs text-slate-400">{s.credentialUid}</p>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={s.todayStatus} />
              </td>
              <td className="px-4 py-3 text-center text-green-700 font-medium hidden sm:table-cell">
                {s.thirtyDayPresent}
              </td>
              <td className="px-4 py-3 text-center text-amber-700 font-medium hidden sm:table-cell">
                {s.thirtyDayTardy}
              </td>
              <td className="px-4 py-3 text-center text-red-700 font-medium hidden sm:table-cell">
                {s.thirtyDayAbsent}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {s.isHabituallyTardy && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                      Habitual Tardy
                    </span>
                  )}
                  {s.isChronicAbsentee && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
                      Chronic Absent
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

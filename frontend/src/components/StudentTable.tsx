import type { GroupStudent } from '../types';
import { FLAGS } from '../strings';
import StatusBadge from './StatusBadge';

interface Props {
  students: GroupStudent[];
  onStudentClick: (studentId: string) => void;
}

// Who is missing comes first: absent, then not scanned yet, then everyone else (by name within each).
const ORDER = (s: GroupStudent) => (s.todayStatus === 'ABSENT' ? 0 : s.todayStatus === null ? 1 : 2);

function Flags({ s }: { s: GroupStudent }) {
  return (
    <>
      {s.isHabituallyTardy && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">{FLAGS.tardy}</span>
      )}
      {s.isChronicAbsentee && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">{FLAGS.absent}</span>
      )}
    </>
  );
}

export default function StudentTable({ students, onStudentClick }: Props) {
  const sorted = [...students].sort((a, b) => ORDER(a) - ORDER(b) || a.name.localeCompare(b.name, 'es'));
  const th = 'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide';
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className={`${th} text-left`}>Alumno</th>
            <th className={`${th} text-left`}>Hoy</th>
            <th className={`${th} text-center hidden sm:table-cell`} title="Últimos 30 días">Asist.</th>
            <th className={`${th} text-center hidden sm:table-cell`} title="Últimos 30 días">Ret.</th>
            <th className={`${th} text-center hidden sm:table-cell`} title="Últimos 30 días">Faltas</th>
            <th className={`${th} text-left hidden sm:table-cell`}>Alertas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((s) => (
            <tr key={s.id} onClick={() => onStudentClick(s.id)} className="hover:bg-blue-50 cursor-pointer transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{s.name}</p>
                <p className="text-xs text-slate-400">{s.credentialUid}</p>
                <div className="flex flex-wrap gap-1 mt-1 sm:hidden"><Flags s={s} /></div>
              </td>
              <td className="px-4 py-3"><StatusBadge status={s.todayStatus} /></td>
              <td className="px-4 py-3 text-center text-green-700 font-medium hidden sm:table-cell">{s.thirtyDayPresent}</td>
              <td className="px-4 py-3 text-center text-amber-700 font-medium hidden sm:table-cell">{s.thirtyDayTardy}</td>
              <td className="px-4 py-3 text-center text-red-700 font-medium hidden sm:table-cell">{s.thirtyDayAbsent}</td>
              <td className="px-4 py-3 hidden sm:table-cell">
                <div className="flex flex-wrap gap-1"><Flags s={s} /></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { AttendanceStatus } from '../types';
import { NO_RECORD, STATUS } from '../strings';

interface Props {
  status: AttendanceStatus | null;
  size?: 'sm' | 'md';
}

const CLS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-100 text-green-800',
  TARDY: 'bg-amber-100 text-amber-800',
  ABSENT: 'bg-red-100 text-red-800',
  EXCUSED: 'bg-purple-100 text-purple-800',
};

export default function StatusBadge({ status, size = 'sm' }: Props) {
  if (!status) {
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium bg-slate-100 text-slate-500
          ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}
      >
        {NO_RECORD}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${CLS[status]}
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}
    >
      {STATUS[status]}
    </span>
  );
}

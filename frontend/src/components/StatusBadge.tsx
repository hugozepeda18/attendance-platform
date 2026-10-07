import type { AttendanceStatus } from '../types';

interface Props {
  status: AttendanceStatus | null;
  size?: 'sm' | 'md';
}

const MAP: Record<AttendanceStatus, { label: string; cls: string }> = {
  PRESENT: { label: 'Present', cls: 'bg-green-100 text-green-800' },
  TARDY: { label: 'Tardy', cls: 'bg-amber-100 text-amber-800' },
  ABSENT: { label: 'Absent', cls: 'bg-red-100 text-red-800' },
  EXCUSED: { label: 'Excused', cls: 'bg-purple-100 text-purple-800' },
};

export default function StatusBadge({ status, size = 'sm' }: Props) {
  if (!status) {
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium bg-slate-100 text-slate-500
          ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}
      >
        No record
      </span>
    );
  }

  const { label, cls } = MAP[status];
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${cls}
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}
    >
      {label}
    </span>
  );
}

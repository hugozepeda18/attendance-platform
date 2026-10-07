interface Props {
  label: string;
  value: number | string;
  color?: 'green' | 'amber' | 'red' | 'blue' | 'slate';
  sub?: string;
}

const COLOR_MAP = {
  green: 'text-green-600 bg-green-50 border-green-200',
  amber: 'text-amber-600 bg-amber-50 border-amber-200',
  red: 'text-red-600 bg-red-50 border-red-200',
  blue: 'text-blue-600 bg-blue-50 border-blue-200',
  slate: 'text-slate-600 bg-slate-50 border-slate-200',
};

export default function KPICard({ label, value, color = 'slate', sub }: Props) {
  return (
    <div className={`rounded-xl border p-4 ${COLOR_MAP[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

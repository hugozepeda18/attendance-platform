import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from 'recharts';

interface TodayCounts {
  total: number;
  present: number;
  tardy: number;
  absent: number;
  excused: number;
}

interface Props {
  today: TodayCounts;
  thirtyDayRate: number;
}

const PIE_COLORS: Record<string, string> = {
  Present: '#22c55e',
  Tardy: '#f59e0b',
  Absent: '#ef4444',
  Excused: '#a855f7',
  'No Record': '#e2e8f0',
};

export default function AttendanceChart({ today, thirtyDayRate }: Props) {
  const noRecord = today.total - today.present - today.tardy - today.absent - today.excused;

  const pieData = [
    { name: 'Present', value: today.present },
    { name: 'Tardy', value: today.tardy },
    { name: 'Absent', value: today.absent },
    { name: 'Excused', value: today.excused },
    { name: 'No Record', value: noRecord > 0 ? noRecord : 0 },
  ].filter((d) => d.value > 0);

  const rateData = [
    { label: 'Rate', value: thirtyDayRate },
    { label: 'Gap', value: Math.max(0, 100 - thirtyDayRate) },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {/* Today's breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Today's Breakdown</h3>
        {pieData.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No records yet today</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                dataKey="value"
                paddingAngle={2}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? '#cbd5e1'} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [v, 'Students']} />
              <Legend iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 30-day rate */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col">
        <h3 className="text-sm font-semibold text-slate-600 mb-2">30-Day Attendance Rate</h3>
        <div className="flex-1 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold text-blue-600">{thirtyDayRate.toFixed(1)}%</span>
          <span className="text-xs text-slate-400 mt-1">present or tardy</span>
          <div className="mt-4 w-full">
            <ResponsiveContainer width="100%" height={48}>
              <BarChart data={rateData} layout="vertical" barSize={20}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="label" hide />
                <Bar dataKey="value" stackId="a" radius={[4, 0, 0, 4]}>
                  <Cell fill="#3b82f6" />
                  <Cell fill="#e2e8f0" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

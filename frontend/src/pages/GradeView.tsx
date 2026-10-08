import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { getGroupAnalytics } from '../services/attendance';
import type { GroupAnalytics } from '../types';

interface Props {
  grade: number;
  groups: string[];
  refreshKey: number;
  onGroupSelect: (grade: number, group: string) => void;
}

interface GroupCard {
  group: string;
  data: GroupAnalytics | null;
  error: boolean;
}

export default function GradeView({ grade, groups, refreshKey, onGroupSelect }: Props) {
  const [cards, setCards] = useState<GroupCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all(
      groups.map((g) =>
        getGroupAnalytics(grade, g)
          .then((data): GroupCard => ({ group: g, data, error: false }))
          .catch((): GroupCard => ({ group: g, data: null, error: true })),
      ),
    )
      .then(setCards)
      .finally(() => setIsLoading(false));
  }, [grade, groups.join(), refreshKey]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        Loading grade {grade} overview…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Grade {grade} Overview</h2>
        <p className="text-sm text-slate-400">All groups — click a card to view group details</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(({ group, data, error }) => (
          <button
            key={group}
            onClick={() => onGroupSelect(grade, group)}
            disabled={error || !data}
            className="text-left bg-white rounded-xl border border-slate-200 p-5 shadow-sm
              hover:border-blue-400 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-default"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-blue-500" />
                <span className="font-bold text-slate-700 text-base">
                  Group {group}
                </span>
              </div>
              {data && (
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {data.thirtyDayRate.toFixed(1)}% 30-day
                </span>
              )}
            </div>

            {error || !data ? (
              <p className="text-sm text-slate-400">No data available</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Total', value: data.today.total, cls: 'text-slate-700' },
                  { label: 'Present', value: data.today.present, cls: 'text-green-600' },
                  { label: 'Tardy', value: data.today.tardy, cls: 'text-amber-600' },
                  { label: 'Absent', value: data.today.absent, cls: 'text-red-600' },
                ].map(({ label, value, cls }) => (
                  <div key={label}>
                    <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                    <p className="text-xs text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

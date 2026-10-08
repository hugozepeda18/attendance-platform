import { useEffect, useState } from 'react';
import axios from 'axios';
import { decideChangeRequest, listChangeRequests } from '../services/attendance';
import type { ChangeRequest, RequestState, UserRole } from '../types';
import StatusBadge from '../components/StatusBadge';

interface Props {
  role: UserRole;
  onDecided: () => void; // refresh the pending badge and the views behind
}

const STATE_STYLE: Record<RequestState, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-slate-100 text-slate-500',
};

// Principal: the school's requests, pending first, with Approve / Reject. Staff: their own requests.
export default function RequestsView({ role, onDecided }: Props) {
  const [requests, setRequests] = useState<ChangeRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPrincipal = role !== 'STAFF';

  const reload = () =>
    listChangeRequests()
      .then((r) => setRequests([...r.requests].sort((a, b) => Number(b.state === 'PENDING') - Number(a.state === 'PENDING'))))
      .catch(() => setError('Failed to load requests.'));
  useEffect(() => {
    reload();
  }, []);

  async function decide(id: string, approve: boolean) {
    setError(null);
    try {
      await decideChangeRequest(id, approve);
    } catch (err) {
      setError((axios.isAxiosError(err) && err.response?.data?.message) || 'Could not save the decision.');
    }
    await reload();
    onDecided();
  }

  if (!requests) return <div className="py-20 text-center text-slate-400">{error ?? 'Loading…'}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{isPrincipal ? 'Change requests' : 'My requests'}</h2>
        <p className="text-sm text-slate-400">
          {isPrincipal ? 'Staff ask to change a day’s attendance; nothing changes until you approve.' : 'The principal approves or rejects each request.'}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {requests.length === 0 && <p className="py-10 text-center text-slate-400">No requests yet.</p>}

      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-slate-800">
                {r.student.name} <span className="text-sm text-slate-400">· {r.student.grade}-{r.student.group} · {r.date}</span>
              </p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATE_STYLE[r.state]}`}>{r.state.toLowerCase()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {r.fromStatus ? <StatusBadge status={r.fromStatus} /> : <span className="text-slate-400">no record</span>}
              <span className="text-slate-400">→</span>
              <StatusBadge status={r.toStatus} />
            </div>
            <p className="text-sm text-slate-600">“{r.reason}”</p>
            <p className="text-xs text-slate-400">
              {isPrincipal && `By ${r.requestedBy} · `}
              {new Date(r.createdAt).toLocaleString()}
              {r.decidedBy && ` · ${r.state.toLowerCase()} by ${r.decidedBy}`}
            </p>
            {isPrincipal && r.state === 'PENDING' && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => decide(r.id, true)} className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                  Approve
                </button>
                <button onClick={() => decide(r.id, false)} className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50">
                  Reject
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

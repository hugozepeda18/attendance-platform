import { useEffect, useState } from 'react';
import { decideChangeRequest, listChangeRequests } from '../services/attendance';
import type { ChangeRequest, RequestState, UserRole } from '../types';
import StatusBadge from '../components/StatusBadge';
import { NO_RECORD, REQUEST_STATE, T, errorText, fmtDateTime, fmtDay } from '../strings';

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
      .catch(() => setError(T.loadFailed));
  useEffect(() => {
    reload();
  }, []);

  async function decide(id: string, approve: boolean) {
    setError(null);
    try {
      await decideChangeRequest(id, approve);
    } catch (err) {
      setError(errorText(err));
    }
    await reload();
    onDecided();
  }

  if (!requests) return <div className="py-20 text-center text-slate-400">{error ?? T.loading}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{isPrincipal ? 'Solicitudes de cambio' : 'Mis solicitudes'}</h2>
        <p className="text-sm text-slate-400">
          {isPrincipal ? 'El personal pide cambiar la asistencia de un día; nada cambia hasta que usted lo apruebe.' : 'La dirección aprueba o rechaza cada solicitud.'}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {requests.length === 0 && <p className="py-10 text-center text-slate-400">Aún no hay solicitudes.</p>}

      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-slate-800">
                {r.student.name} <span className="text-sm text-slate-400">· {r.student.grade}-{r.student.group} · {fmtDay(r.date)}</span>
              </p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATE_STYLE[r.state]}`}>{REQUEST_STATE[r.state]}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {r.fromStatus ? <StatusBadge status={r.fromStatus} /> : <span className="text-slate-400">{NO_RECORD}</span>}
              <span className="text-slate-400">→</span>
              <StatusBadge status={r.toStatus} />
            </div>
            <p className="text-sm text-slate-600">“{r.reason}”</p>
            <p className="text-xs text-slate-400">
              {isPrincipal && `${r.requestedBy} · `}
              {fmtDateTime(r.createdAt)}
              {r.decidedBy && ` · ${REQUEST_STATE[r.state]} por ${r.decidedBy}`}
            </p>
            {isPrincipal && r.state === 'PENDING' && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => decide(r.id, true)} className="flex-1 sm:flex-none px-5 min-h-[48px] rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                  Aprobar
                </button>
                <button onClick={() => decide(r.id, false)} className="flex-1 sm:flex-none px-5 min-h-[48px] rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50">
                  Rechazar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

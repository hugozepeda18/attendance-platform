import { useState } from 'react';
import { X, ShieldCheck, Send } from 'lucide-react';
import { requestChange } from '../services/attendance';
import type { AttendanceStatus, UserRole } from '../types';
import { NO_RECORD, STATUS, T, errorText, fmtLongDay } from '../strings';

interface Props {
  studentId: string;
  studentName: string;
  date: string; // YYYY-MM-DD
  currentStatus: AttendanceStatus | null;
  initialStatus?: AttendanceStatus;
  role: UserRole;
  onClose: () => void;
  onComplete: (message: string) => void;
}

const STATUSES: AttendanceStatus[] = ['PRESENT', 'TARDY', 'ABSENT', 'EXCUSED'];

// Staff send a request to the principal; the principal's change applies right away.
// The guardian is never messaged about either.
export default function ChangeModal({ studentId, studentName, date, currentStatus, initialStatus, role, onClose, onComplete }: Props) {
  const direct = role !== 'STAFF';
  const [status, setStatus] = useState<AttendanceStatus>(initialStatus ?? currentStatus ?? 'TARDY');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);
    try {
      const { applied } = await requestChange({ studentId, date, status, reason: reason.trim() });
      onComplete(applied ? 'Asistencia actualizada.' : 'Solicitud enviada a la dirección.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-full overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between pl-4 sm:pl-6 pr-2 py-2 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {direct ? <ShieldCheck size={20} className="text-indigo-600" /> : <Send size={20} className="text-indigo-600" />}
            <h2 className="font-bold text-slate-800">{direct ? 'Cambiar asistencia' : 'Solicitar un cambio'}</h2>
          </div>
          <button onClick={onClose} aria-label={T.close} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            <span className="font-semibold">{studentName}</span> · {fmtLongDay(date)} · ahora{' '}
            <span className="font-medium">{currentStatus ? STATUS[currentStatus] : NO_RECORD}</span>
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Nuevo estado</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`min-h-[48px] rounded-lg border text-sm font-medium transition-all
                    ${status === s ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  {STATUS[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="change-reason" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Motivo
            </label>
            <textarea
              id="change-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="p. ej. Llegó 9:10 con su mamá"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm text-slate-700
                placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none"
            />
          </div>

          {!direct && <p className="text-xs text-slate-500">La dirección debe aprobarlo antes de que cambie.</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 px-4 sm:px-6 pb-5">
          <button onClick={onClose} className="flex-1 min-h-[48px] rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {T.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !reason.trim() || status === currentStatus}
            className="flex-1 min-h-[48px] rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? T.saving : direct ? T.save : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}

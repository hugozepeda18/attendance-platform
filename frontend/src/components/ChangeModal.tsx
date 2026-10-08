import { useState } from 'react';
import axios from 'axios';
import { X, ShieldCheck, Send } from 'lucide-react';
import { requestChange } from '../services/attendance';
import type { AttendanceStatus, UserRole } from '../types';

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
      onComplete(applied ? 'Attendance updated.' : 'Request sent to the principal.');
    } catch (err) {
      setError((axios.isAxiosError(err) && err.response?.data?.message) || 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {direct ? <ShieldCheck size={20} className="text-indigo-600" /> : <Send size={20} className="text-indigo-600" />}
            <h2 className="font-bold text-slate-800">{direct ? 'Change attendance' : 'Request a change'}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            <span className="font-semibold">{studentName}</span> · {date} · now{' '}
            <span className="font-medium">{currentStatus ? currentStatus.toLowerCase() : 'no record'}</span>
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">New status</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-all
                    ${status === s ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="change-reason" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Reason
            </label>
            <textarea
              id="change-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="e.g. Arrived 9:10 with their mother"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700
                placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none"
            />
          </div>

          {!direct && <p className="text-xs text-slate-500">The principal must approve it before it changes.</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !reason.trim() || status === currentStatus}
            className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : direct ? 'Save' : 'Send request'}
          </button>
        </div>
      </div>
    </div>
  );
}

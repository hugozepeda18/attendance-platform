import { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { patchRecord } from '../services/attendance';
import type { AttendanceStatus } from '../types';

interface Props {
  recordId: string;
  currentStatus: AttendanceStatus;
  studentName: string;
  onClose: () => void;
  onComplete: () => void;
}

const STATUSES: AttendanceStatus[] = ['PRESENT', 'TARDY', 'ABSENT', 'EXCUSED'];

export default function OverrideModal({
  recordId,
  currentStatus,
  studentName,
  onClose,
  onComplete,
}: Props) {
  const [status, setStatus] = useState<AttendanceStatus>(currentStatus);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (status === currentStatus && !note.trim()) {
      onClose();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await patchRecord(recordId, status, note.trim());
      onComplete();
    } catch {
      setError('Failed to update. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-indigo-600" />
            <h2 className="font-bold text-slate-800">Override Attendance</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            Updating record for <span className="font-semibold">{studentName}</span>
          </p>

          {/* Status selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              New Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-all
                    ${status === s
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Medical certificate provided"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700
                placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400
                focus:border-transparent resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium
              text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold
              hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving…' : 'Confirm Override'}
          </button>
        </div>
      </div>
    </div>
  );
}

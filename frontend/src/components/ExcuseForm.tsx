import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { excuseInAdvance } from '../services/attendance';

interface Props {
  studentId: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}

const QUICK_REASONS = ['Cita médica', 'Enfermedad', 'Asunto familiar'];
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local

// Excuse a student before the absence run so the guardian gets no absence notice (Phase 13b).
export default function ExcuseForm({ studentId, onDone, onCancel }: Props) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { excused, skipped } = await excuseInAdvance({ studentId, from, to: to || undefined, reason: reason.trim() });
      onDone(
        `Excused: ${excused.join(', ') || 'none'}` +
          (skipped.length ? `. Already recorded (unchanged): ${skipped.join(', ')}` : ''),
      );
    } catch (err) {
      setError((axios.isAxiosError(err) && err.response?.data?.message) || 'Could not save the excuse.');
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';

  return (
    <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3 bg-purple-50 border-b border-purple-100">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">From</span>
          <input type="date" required min={today()} value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Until (optional)</span>
          <input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={`px-3 py-2 rounded-full border text-sm ${reason === r ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        required
        maxLength={200}
        aria-label="Reason"
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className={input}
      />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !reason.trim()} className="flex-1 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save excuse'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { excuseInAdvance } from '../services/attendance';
import { T, errorText, fmtDay } from '../strings';

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
        `Justificado: ${excused.map(fmtDay).join(', ') || 'ningún día'}` +
          (skipped.length ? `. Ya tenían registro (sin cambio): ${skipped.map(fmtDay).join(', ')}` : ''),
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full px-3 min-h-[48px] rounded-lg border border-slate-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';

  return (
    <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 space-y-3 bg-purple-50 border-b border-purple-100">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Desde</span>
          <input type="date" required min={today()} value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Hasta (opcional)</span>
          <input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={`px-4 min-h-[44px] rounded-full border text-sm ${reason === r ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        required
        maxLength={200}
        aria-label="Motivo"
        placeholder="Motivo"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className={input}
      />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !reason.trim()} className="flex-1 min-h-[48px] rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
          {saving ? T.saving : 'Guardar justificante'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 min-h-[48px] rounded-lg border border-slate-300 bg-white text-sm text-slate-700">
          {T.cancel}
        </button>
      </div>
    </form>
  );
}

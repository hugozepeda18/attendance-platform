import { useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';
import { errorText } from '../strings';

export const inputClass =
  'w-full px-3 min-h-[44px] rounded-lg border border-slate-300 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
export const primaryButton =
  'px-4 min-h-[44px] rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50';
export const secondaryButton =
  'px-4 min-h-[44px] rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50';

export const TIMEZONES = [
  'America/Mexico_City', 'America/Monterrey', 'America/Merida', 'America/Cancun', 'America/Chihuahua',
  'America/Mazatlan', 'America/Hermosillo', 'America/Tijuana', 'America/Bogota', 'America/Lima',
  'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/Madrid',
];

export const apiMessage = errorText;

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

// Shows a secret (key, link) with a copy button.
export function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <code className="flex-1 min-w-0 truncate px-2 py-1.5 rounded bg-slate-100 text-xs text-slate-800">{value}</code>
      <button
        type="button"
        aria-label="Copiar"
        title="Copiar"
        onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(() => {})}
        className="w-11 h-11 flex items-center justify-center shrink-0 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
      >
        {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
      </button>
    </div>
  );
}

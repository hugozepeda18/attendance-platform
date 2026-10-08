import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ExternalLink, LifeBuoy } from 'lucide-react';
import type { ApiKeyInfo, SchoolDetail as Detail } from '../types';
import { getSchool, issueKey, listKeys, openAsSupport, revokeKey, updateSchool } from '../services/admin';
import { schoolUrl } from '../services/school';
import StaffView from '../pages/StaffView';
import { apiMessage, Card, CopyValue, Field, inputClass, primaryButton, secondaryButton, TIMEZONES } from './ui';

interface Props {
  id: string;
  onBack: () => void;
}

type SettingsForm = {
  name: string;
  slug: string;
  schoolStartTime: string;
  tardyGraceMinutes: number;
  absenceCutoffMinutes: number;
  timezone: string;
  principalWhatsApp: string;
};

function toForm(s: Detail): SettingsForm {
  return {
    name: s.name,
    slug: s.slug,
    schoolStartTime: s.config?.schoolStartTime ?? '08:00',
    tardyGraceMinutes: s.config?.tardyGraceMinutes ?? 10,
    absenceCutoffMinutes: s.config?.absenceCutoffMinutes ?? 30,
    timezone: s.config?.timezone ?? 'America/Mexico_City',
    principalWhatsApp: s.config?.principalWhatsApp ?? '',
  };
}

export default function SchoolDetail({ id, onBack }: Props) {
  const [school, setSchool] = useState<Detail | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ role: ApiKeyInfo['role']; label: string }>({ role: 'SCANNER', label: '' });
  const [issued, setIssued] = useState<string | null>(null);

  async function reload() {
    const [s, k] = await Promise.all([getSchool(id), listKeys(id)]);
    setSchool(s);
    setForm(toForm(s));
    setKeys(k);
  }

  useEffect(() => {
    reload().catch(() => setError('Failed to load the school.'));
  }, [id]);

  async function run(action: () => Promise<void>, fallback: string, done?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      await reload();
      if (done) setNotice(done);
    } catch (err) {
      setError(apiMessage(err, fallback));
    }
  }

  function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (form) run(() => updateSchool(id, form), 'Could not save settings.', 'Settings saved.');
  }

  function toggleActive() {
    if (!school) return;
    if (school.active && !window.confirm(`Deactivate ${school.name}? Everyone at this school will be signed out and locked out.`)) return;
    run(() => updateSchool(id, { active: !school.active }), 'Could not change the status.');
  }

  function handleIssue(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      setIssued(await issueKey(id, newKey.role, newKey.label.trim()));
      setNewKey({ role: 'SCANNER', label: '' });
    }, 'Could not issue the key.');
  }

  if (!school || !form) {
    return <div className="py-20 text-center text-slate-400">{error ?? 'Loading…'}</div>;
  }

  const set = (patch: Partial<SettingsForm>) => setForm({ ...form, ...patch });

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> All schools
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            {school.name}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${school.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {school.active ? 'Active' : 'Inactive'}
            </span>
          </h1>
          <a href={schoolUrl(school.slug)} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1 break-all">
            {schoolUrl(school.slug)} <ExternalLink size={13} />
          </a>
          <p className="text-sm text-slate-500">
            {school.studentCount} students · {school.userCount} users · {school.activeKeyCount} active device keys
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button onClick={() => openAsSupport(id, school.slug).catch((err) => setError(apiMessage(err, 'Could not open the school.')))} className={secondaryButton} title="Open the school's page with principal powers (2 hours)">
          <span className="flex items-center gap-1.5"><LifeBuoy size={15} /> Open as support</span>
        </button>
        <button onClick={toggleActive}
          className={school.active ? 'px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50' : primaryButton}>
          {school.active ? 'Deactivate school' : 'Activate school'}
        </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}

      <form onSubmit={saveSettings}>
        <Card title="Settings" action={<button type="submit" className={primaryButton}>Save</button>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name">
              <input required className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Address">
              <input required pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?" className={`${inputClass} font-mono`}
                value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
            </Field>
            <Field label="Timezone">
              <input required list="tz-list" className={inputClass} value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} />
              <datalist id="tz-list">{TIMEZONES.map((tz) => <option key={tz} value={tz} />)}</datalist>
            </Field>
            <Field label="School start time">
              <input type="time" required className={inputClass} value={form.schoolStartTime}
                onChange={(e) => set({ schoolStartTime: e.target.value })} />
            </Field>
            <Field label="Tardy after (min)">
              <input type="number" min={0} max={240} required className={inputClass} value={form.tardyGraceMinutes}
                onChange={(e) => set({ tardyGraceMinutes: Number(e.target.value) })} />
            </Field>
            <Field label="Mark absent at (min)">
              <input type="number" min={0} max={600} required className={inputClass} value={form.absenceCutoffMinutes}
                onChange={(e) => set({ absenceCutoffMinutes: Number(e.target.value) })} />
            </Field>
            <Field label="Principal's WhatsApp (alerts)">
              <input type="tel" pattern="\+\d{10,15}" placeholder="+523312345678" className={inputClass} value={form.principalWhatsApp}
                onChange={(e) => set({ principalWhatsApp: e.target.value.replace(/[\s-]/g, '') })} />
            </Field>
          </div>
          {form.slug !== school.slug && (
            <p className="text-sm text-amber-700">Changing the address breaks the old link; tell the school their new one.</p>
          )}
        </Card>
      </form>

      <Card title="Device keys">
        {issued && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-sm text-amber-800 font-medium">New key: copy it now, it won't be shown again.</p>
            <CopyValue value={issued} />
            <button className="text-sm text-amber-800 underline" onClick={() => setIssued(null)}>I've stored it</button>
          </div>
        )}
        <form onSubmit={handleIssue} className="flex flex-wrap gap-2">
          <select aria-label="Key role" className={`${inputClass} w-auto`} value={newKey.role}
            onChange={(e) => setNewKey({ ...newKey, role: e.target.value as ApiKeyInfo['role'] })}>
            <option value="SCANNER">Scanner</option>
            <option value="STAFF">Staff</option>
            <option value="PRINCIPAL">Principal</option>
          </select>
          <input required aria-label="Key label" placeholder="Label, e.g. Gate 2" className={`${inputClass} flex-1 min-w-[10rem]`}
            value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} />
          <button type="submit" className={secondaryButton}>Issue key</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr><th className="py-2 pr-4">Label</th><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Created</th><th className="py-2" /></tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className={`border-t border-slate-100 ${k.revokedAt ? 'text-slate-400' : 'text-slate-700'}`}>
                  <td className="py-2 pr-4">{k.label}</td>
                  <td className="py-2 pr-4">{k.role}</td>
                  <td className="py-2 pr-4">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 text-right">
                    {k.revokedAt ? 'Revoked' : (
                      <button className="text-red-600 font-medium"
                        onClick={() => window.confirm(`Revoke "${k.label}"? Devices using it stop working immediately.`) &&
                          run(() => revokeKey(id, k.id), 'Could not revoke the key.')}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Users">
        <StaffView currentUserId={null} schoolId={id} />
      </Card>
    </div>
  );
}

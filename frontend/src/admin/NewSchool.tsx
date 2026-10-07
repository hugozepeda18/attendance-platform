import { useState, type FormEvent } from 'react';
import { createSchool, type NewSchoolInput } from '../services/admin';
import { schoolUrl } from '../services/school';
import { apiMessage, Card, CopyValue, Field, inputClass, primaryButton, secondaryButton, TIMEZONES } from './ui';

interface Props {
  onCancel: () => void;
  onDone: (schoolId: string) => void;
}

type Created = Awaited<ReturnType<typeof createSchool>>;

const empty: NewSchoolInput = {
  name: '',
  slug: '',
  schoolStartTime: '08:00',
  tardyGraceMinutes: 10,
  absenceCutoffMinutes: 30,
  timezone: 'America/Mexico_City',
  principal: { email: '', name: '', password: '' },
};

const toSlug = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function NewSchool({ onCancel, onDone }: Props) {
  const [form, setForm] = useState(empty);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const set = (patch: Partial<NewSchoolInput>) => setForm((f) => ({ ...f, ...patch }));
  const setPrincipal = (patch: Partial<NewSchoolInput['principal']>) =>
    setForm((f) => ({ ...f, principal: { ...f.principal, ...patch } }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      setCreated(await createSchool({ ...form, principal: { ...form.principal, email: form.principal.email.trim() } }));
    } catch (err) {
      setError(apiMessage(err, 'Could not create the school.'));
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-bold text-slate-800">{created.school.name} is ready</h1>
        <Card title="School address">
          <p className="text-sm text-slate-600">Send this link and the principal's password to the school.</p>
          <CopyValue value={schoolUrl(created.school.slug)} />
        </Card>
        <Card title="Device keys (shown only once)">
          <p className="text-sm text-slate-600">
            Use the SCANNER key on the gate badge readers. Store these now; they can't be shown again (you can always issue new ones).
          </p>
          <div className="space-y-2">
            {created.apiKeys.map((k) => (
              <div key={k.role} className="grid grid-cols-[6rem_1fr] items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">{k.role}</span>
                <CopyValue value={k.key} />
              </div>
            ))}
          </div>
        </Card>
        <button className={primaryButton} onClick={() => onDone(created.school.id)}>Open school</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-slate-800">New school</h1>

      <Card title="School">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input required className={inputClass} value={form.name}
              onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: toSlug(e.target.value) }) })} />
          </Field>
          <Field label="Address">
            <div className="flex items-center gap-1">
              <input required pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?" title="Lowercase letters, digits and hyphens"
                className={`${inputClass} font-mono`} value={form.slug}
                onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase() }); }} />
            </div>
            <span className="text-xs text-slate-500 break-all">{form.slug ? schoolUrl(form.slug) : ' '}</span>
          </Field>
        </div>
      </Card>

      <Card title="Schedule">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School start time">
            <input type="time" required className={inputClass} value={form.schoolStartTime}
              onChange={(e) => set({ schoolStartTime: e.target.value })} />
          </Field>
          <Field label="Timezone">
            <input required list="tz-list" className={inputClass} value={form.timezone}
              onChange={(e) => set({ timezone: e.target.value })} />
            <datalist id="tz-list">{TIMEZONES.map((tz) => <option key={tz} value={tz} />)}</datalist>
          </Field>
          <Field label="Tardy after (minutes past start)">
            <input type="number" min={0} max={240} required className={inputClass} value={form.tardyGraceMinutes}
              onChange={(e) => set({ tardyGraceMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Mark absent at (minutes past start)">
            <input type="number" min={0} max={600} required className={inputClass} value={form.absenceCutoffMinutes}
              onChange={(e) => set({ absenceCutoffMinutes: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card title="First principal">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input required className={inputClass} value={form.principal.name} onChange={(e) => setPrincipal({ name: e.target.value })} />
          </Field>
          <Field label="Email">
            <input type="email" required className={inputClass} value={form.principal.email}
              onChange={(e) => setPrincipal({ email: e.target.value })} />
          </Field>
          <Field label="Initial password (10+ characters)">
            <input type="password" required minLength={10} autoComplete="new-password" className={inputClass}
              value={form.principal.password} onChange={(e) => setPrincipal({ password: e.target.value })} />
          </Field>
        </div>
      </Card>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Creating…' : 'Create school'}</button>
        <button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button>
      </div>
    </form>
  );
}

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Check, CircleAlert, Loader2, RefreshCw } from 'lucide-react';
import { createSchool, openAsSupport, slugAvailable, type NewSchoolInput } from '../services/admin';
import { schoolUrl } from '../services/school';
import { ROLE, T } from '../strings';
import { apiMessage, Card, CopyValue, Field, inputClass, primaryButton, secondaryButton, TIMEZONES } from './ui';

interface Props {
  onCancel: () => void;
  onDone: (schoolId: string) => void;
}

type Created = Awaited<ReturnType<typeof createSchool>>;
type Availability = { state: 'idle' | 'checking' } | { state: 'free' } | { state: 'taken'; reason: string };

const STEPS = ['Escuela', 'Horario', 'Dirección', 'Revisar'];

const empty: NewSchoolInput = {
  name: '',
  slug: '',
  schoolStartTime: '07:30',
  tardyGraceMinutes: 10,
  absenceCutoffMinutes: 30,
  timezone: 'America/Mexico_City',
  principalWhatsApp: '',
  principal: { email: '', name: '', password: '' },
};

const toSlug = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// "07:30" + 10 → "07:40"
function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Readable, no look-alike characters (0/O, 1/l/I): it gets typed from a WhatsApp message.
function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => chars[n % chars.length]).join('');
}

function welcomeMessage(form: NewSchoolInput, url: string): string {
  return [
    `Hola ${form.principal.name}, la plataforma de asistencia de ${form.name} ya está lista.`,
    ``,
    `Entra en: ${url}`,
    `Correo: ${form.principal.email.trim()}`,
    `Contraseña inicial: ${form.principal.password}`,
    ``,
    `Desde ahí puedes dar de alta a tu personal y a tus alumnos, y ver la asistencia del día.`,
  ].join('\n');
}

export default function NewSchool({ onCancel, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(empty);
  const [slugTouched, setSlugTouched] = useState(false);
  const [availability, setAvailability] = useState<Availability>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const set = (patch: Partial<NewSchoolInput>) => setForm((f) => ({ ...f, ...patch }));
  const setPrincipal = (patch: Partial<NewSchoolInput['principal']>) =>
    setForm((f) => ({ ...f, principal: { ...f.principal, ...patch } }));

  // Checks the address while the owner types (after a short pause).
  useEffect(() => {
    if (!form.slug) return setAvailability({ state: 'idle' });
    setAvailability({ state: 'checking' });
    const timer = setTimeout(() => {
      slugAvailable(form.slug)
        .then((r) => setAvailability(r.available ? { state: 'free' } : { state: 'taken', reason: r.reason ?? 'No disponible' }))
        .catch(() => setAvailability({ state: 'idle' }));
    }, 400);
    return () => clearTimeout(timer);
  }, [form.slug]);

  const scheduleError =
    form.absenceCutoffMinutes <= form.tardyGraceMinutes ? 'La falta debe marcarse después del retardo.' : null;

  function next(e: FormEvent) {
    e.preventDefault();
    if (step === 0 && availability.state !== 'free') return;
    if (step === 1 && scheduleError) return;
    setStep(step + 1);
  }

  async function create() {
    setError(null);
    setSaving(true);
    try {
      const { principalWhatsApp, ...rest } = form;
      setCreated(
        await createSchool({
          ...rest,
          ...(principalWhatsApp ? { principalWhatsApp } : {}),
          principal: { ...form.principal, email: form.principal.email.trim() },
        }),
      );
    } catch (err) {
      setError(apiMessage(err, 'No se pudo crear la escuela.'));
    } finally {
      setSaving(false);
    }
  }

  if (created) return <Done created={created} form={form} onDone={onDone} />;

  const nav = (
    <div className="flex flex-wrap gap-2 pt-2">
      {step < 3 ? (
        <button type="submit" className={primaryButton} disabled={(step === 0 && availability.state !== 'free') || (step === 1 && !!scheduleError)}>
          Siguiente
        </button>
      ) : (
        <button type="button" onClick={create} disabled={saving} className={primaryButton}>
          {saving ? 'Creando…' : 'Crear escuela'}
        </button>
      )}
      {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className={secondaryButton}>Atrás</button>}
      <button type="button" onClick={onCancel} className="px-4 min-h-[44px] text-sm text-slate-500 hover:text-slate-800">{T.cancel}</button>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Nueva escuela</h1>

      {/* Step indicator; finished steps can be revisited */}
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              disabled={i >= step}
              onClick={() => setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={`min-h-[44px] flex items-center gap-1.5 ${i === step ? 'text-blue-700 font-semibold' : i < step ? 'text-slate-700 hover:underline' : 'text-slate-400'}`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs
                ${i < step ? 'bg-green-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {i < step ? <Check size={13} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-slate-300" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form onSubmit={next}>
          <Card title="¿Qué escuela?">
            <Field label="Nombre de la escuela">
              <input required autoFocus placeholder="Secundaria Técnica 12" className={inputClass} value={form.name}
                onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: toSlug(e.target.value) }) })} />
            </Field>
            <Field label="Dirección web">
              <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                <input required pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?" title="Minúsculas, números y guiones"
                  className="flex-1 min-w-0 px-3 min-h-[44px] text-base sm:text-sm font-mono outline-none" value={form.slug}
                  onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase() }); }} />
                <span className="px-3 py-2 text-sm text-slate-400 bg-slate-50 border-l border-slate-200 truncate">
                  .{window.location.host.replace(/^admin\./i, '')}
                </span>
              </div>
              <SlugStatus availability={availability} url={form.slug ? schoolUrl(form.slug) : ''} />
            </Field>
            {nav}
          </Card>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={next}>
          <Card title="¿A qué hora entran?">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hora de entrada">
                <input type="time" required autoFocus className={inputClass} value={form.schoolStartTime}
                  onChange={(e) => set({ schoolStartTime: e.target.value })} />
              </Field>
              <Field label="Zona horaria">
                <select className={inputClass} value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/^America\//, '').replace(/_/g, ' ')}</option>)}
                </select>
              </Field>
              <Field label="Retardo después de (minutos)">
                <input type="number" min={0} max={240} required className={inputClass} value={form.tardyGraceMinutes}
                  onChange={(e) => set({ tardyGraceMinutes: Number(e.target.value) })} />
              </Field>
              <Field label="Falta a partir de (minutos)">
                <input type="number" min={1} max={600} required className={inputClass} value={form.absenceCutoffMinutes}
                  onChange={(e) => set({ absenceCutoffMinutes: Number(e.target.value) })} />
              </Field>
            </div>
            <SchedulePreview form={form} />
            {scheduleError && <p role="alert" className="text-sm text-red-600">{scheduleError}</p>}
            {nav}
          </Card>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={next}>
          <Card title="¿Quién dirige la escuela?">
            <p className="text-sm text-slate-500">Entra primero y da de alta a su personal y a sus alumnos.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre completo">
                <input required autoFocus className={inputClass} value={form.principal.name} onChange={(e) => setPrincipal({ name: e.target.value })} />
              </Field>
              <Field label="Correo">
                <input type="email" required className={inputClass} value={form.principal.email}
                  onChange={(e) => setPrincipal({ email: e.target.value })} />
              </Field>
              <Field label="Contraseña inicial (10+ caracteres)">
                <div className="flex gap-2">
                  <input required minLength={10} autoComplete="off" className={`${inputClass} font-mono`}
                    value={form.principal.password} onChange={(e) => setPrincipal({ password: e.target.value })} />
                  <button type="button" onClick={() => setPrincipal({ password: generatePassword() })}
                    title="Generar contraseña" aria-label="Generar contraseña" className={secondaryButton}>
                    <RefreshCw size={15} />
                  </button>
                </div>
              </Field>
              <Field label="WhatsApp (opcional, para avisos)">
                <input type="tel" pattern="\+\d{10,15}" placeholder="+523312345678" className={inputClass}
                  value={form.principalWhatsApp} onChange={(e) => set({ principalWhatsApp: e.target.value.replace(/[\s-]/g, '') })} />
              </Field>
            </div>
            {nav}
          </Card>
        </form>
      )}

      {step === 3 && (
        <Card title="Revisar y crear">
          <Summary title="Escuela" onEdit={() => setStep(0)}>
            {form.name} · <span className="font-mono">{schoolUrl(form.slug)}</span>
          </Summary>
          <Summary title="Horario" onEdit={() => setStep(1)}>
            Entrada {form.schoolStartTime} ({form.timezone}) · retardo después de {form.tardyGraceMinutes} min · falta a partir de {form.absenceCutoffMinutes} min
          </Summary>
          <Summary title="Dirección" onEdit={() => setStep(2)}>
            {form.principal.name} · {form.principal.email}
            {form.principalWhatsApp ? ` · ${form.principalWhatsApp}` : ''}
          </Summary>
          <p className="text-sm text-slate-500">Al crear la escuela también se crean sus llaves de dispositivo (escáner, personal, dirección).</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {nav}
        </Card>
      )}
    </div>
  );
}

function SlugStatus({ availability, url }: { availability: Availability; url: string }) {
  if (availability.state === 'checking') {
    return <span className="flex items-center gap-1 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> Revisando…</span>;
  }
  if (availability.state === 'free') {
    return <span className="flex items-center gap-1 text-xs text-green-700 break-all"><Check size={13} className="shrink-0" /> Disponible: {url}</span>;
  }
  if (availability.state === 'taken') {
    return <span className="flex items-center gap-1 text-xs text-red-600"><CircleAlert size={13} className="shrink-0" /> {availability.reason}</span>;
  }
  return null;
}

// What the gate and the parents will see, so the numbers make sense before saving.
function SchedulePreview({ form }: { form: NewSchoolInput }) {
  const start = form.schoolStartTime || '00:00';
  const late = addMinutes(start, form.tardyGraceMinutes + 1);
  const absent = addMinutes(start, form.absenceCutoffMinutes);
  const rows = [
    { color: 'bg-green-500', time: `hasta ${addMinutes(start, form.tardyGraceMinutes)}`, text: 'A tiempo: el tutor recibe un mensaje de entrada' },
    { color: 'bg-amber-500', time: `${late} – ${addMinutes(start, form.absenceCutoffMinutes - 1)}`, text: 'Retardo: mensaje de entrada, marcado con retardo' },
    { color: 'bg-red-500', time: `desde ${absent}`, text: 'Sin registro: falta, aviso al tutor una vez. Quien llegue después pasa a la dirección' },
  ];
  return (
    <ul className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.color} className="flex gap-3">
          <span className={`w-2.5 h-2.5 mt-1.5 rounded-full shrink-0 ${r.color}`} />
          <span className="font-mono text-slate-700 w-24 sm:w-28 shrink-0">{r.time}</span>
          <span className="text-slate-600">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Summary({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
        <p className="text-sm text-slate-800 break-all">{children}</p>
      </div>
      <button type="button" onClick={onEdit} className="min-h-[44px] px-2 text-sm text-blue-600 hover:underline shrink-0">{T.edit}</button>
    </div>
  );
}

function Done({ created, form, onDone }: { created: Created; form: NewSchoolInput; onDone: (id: string) => void }) {
  const url = schoolUrl(created.school.slug);
  const message = welcomeMessage(form, url);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center"><Check size={16} /></span>
        {created.school.name} está lista
      </h1>

      <Card title="Mensaje de bienvenida para la dirección">
        <p className="text-sm text-slate-600">Cópielo y envíelo por WhatsApp o correo. Incluye la contraseña: envíelo solo a esa persona.</p>
        <textarea readOnly rows={7} value={message} className={`${inputClass} font-mono text-xs resize-none`} />
        <div className="flex flex-wrap gap-2">
          <button className={primaryButton} onClick={() => navigator.clipboard.writeText(message).catch(() => {})}>Copiar mensaje</button>
          {form.principalWhatsApp && (
            <a className={secondaryButton} target="_blank" rel="noreferrer"
              href={`https://wa.me/${form.principalWhatsApp.replace('+', '')}?text=${encodeURIComponent(message)}`}>
              Abrir en WhatsApp
            </a>
          )}
        </div>
      </Card>

      <Card title="Llaves de dispositivo (se muestran una sola vez)">
        <p className="text-sm text-slate-600">
          La llave de escáner va en la PC de la puerta (gate-setup la pide). Guárdelas ahora; no se pueden volver a mostrar (siempre puede crear nuevas).
        </p>
        <div className="space-y-2">
          {created.apiKeys.map((k) => (
            <div key={k.role} className="grid grid-cols-[6rem_1fr] items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">{ROLE[k.role as keyof typeof ROLE] ?? k.role}</span>
              <CopyValue value={k.key} />
            </div>
          ))}
        </div>
      </Card>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={primaryButton} onClick={() => onDone(created.school.id)}>Ir a la configuración de la escuela</button>
        <button className={secondaryButton} onClick={() => openAsSupport(created.school.id, created.school.slug).catch((err) => setError(apiMessage(err, 'No se pudo abrir la escuela.')))}>
          Abrir como soporte
        </button>
      </div>
    </div>
  );
}

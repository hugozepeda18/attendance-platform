import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ExternalLink, LifeBuoy } from 'lucide-react';
import type { ApiKeyInfo, SchoolDetail as Detail } from '../types';
import { getSchool, issueKey, listKeys, openAsSupport, revokeKey, updateSchool } from '../services/admin';
import { schoolUrl } from '../services/school';
import StaffView from '../pages/StaffView';
import { ROLE, T, fmtDateTime } from '../strings';
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
    reload().catch(() => setError(T.loadFailed));
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
    if (form) run(() => updateSchool(id, form), T.saveFailed, 'Configuración guardada.');
  }

  function toggleActive() {
    if (!school) return;
    if (school.active && !window.confirm(`¿Desactivar ${school.name}? Todos en esta escuela perderán el acceso de inmediato.`)) return;
    run(() => updateSchool(id, { active: !school.active }), T.saveFailed);
  }

  function handleIssue(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      setIssued(await issueKey(id, newKey.role, newKey.label.trim()));
      setNewKey({ role: 'SCANNER', label: '' });
    }, T.saveFailed);
  }

  if (!school || !form) {
    return <div className="py-20 text-center text-slate-400">{error ?? T.loading}</div>;
  }

  const set = (patch: Partial<SettingsForm>) => setForm({ ...form, ...patch });

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="min-h-[44px] flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Todas las escuelas
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            {school.name}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${school.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {school.active ? T.active : T.inactive}
            </span>
          </h1>
          <a href={schoolUrl(school.slug)} target="_blank" rel="noreferrer" className="min-h-[44px] text-sm text-blue-600 hover:underline flex items-center gap-1 break-all">
            {schoolUrl(school.slug)} <ExternalLink size={13} />
          </a>
          <p className="text-sm text-slate-500">
            {school.studentCount} alumnos · {school.userCount} usuarios · {school.activeKeyCount} llaves activas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button onClick={() => openAsSupport(id, school.slug).catch((err) => setError(apiMessage(err, 'No se pudo abrir la escuela.')))} className={secondaryButton} title="Abre la página de la escuela con permisos de dirección (2 horas)">
          <span className="flex items-center gap-1.5"><LifeBuoy size={15} /> Abrir como soporte</span>
        </button>
        <button onClick={toggleActive}
          className={school.active ? 'px-4 min-h-[44px] rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50' : primaryButton}>
          {school.active ? 'Desactivar escuela' : 'Activar escuela'}
        </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}

      <form onSubmit={saveSettings}>
        <Card title="Configuración" action={<button type="submit" className={primaryButton}>{T.save}</button>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nombre">
              <input required className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Dirección">
              <input required pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?" className={`${inputClass} font-mono`}
                value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
            </Field>
            <Field label="Zona horaria">
              <input required list="tz-list" className={inputClass} value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} />
              <datalist id="tz-list">{TIMEZONES.map((tz) => <option key={tz} value={tz} />)}</datalist>
            </Field>
            <Field label="Hora de entrada">
              <input type="time" required className={inputClass} value={form.schoolStartTime}
                onChange={(e) => set({ schoolStartTime: e.target.value })} />
            </Field>
            <Field label="Retardo después de (min)">
              <input type="number" min={0} max={240} required className={inputClass} value={form.tardyGraceMinutes}
                onChange={(e) => set({ tardyGraceMinutes: Number(e.target.value) })} />
            </Field>
            <Field label="Falta a partir de (min)">
              <input type="number" min={0} max={600} required className={inputClass} value={form.absenceCutoffMinutes}
                onChange={(e) => set({ absenceCutoffMinutes: Number(e.target.value) })} />
            </Field>
            <Field label="WhatsApp de la dirección (avisos)">
              <input type="tel" pattern="\+\d{10,15}" placeholder="+523312345678" className={inputClass} value={form.principalWhatsApp}
                onChange={(e) => set({ principalWhatsApp: e.target.value.replace(/[\s-]/g, '') })} />
            </Field>
          </div>
          {form.slug !== school.slug && (
            <p className="text-sm text-amber-700">Cambiar la dirección rompe el enlace anterior; avise a la escuela de su nueva dirección.</p>
          )}
        </Card>
      </form>

      <Card title="Llaves de dispositivos">
        {issued && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-sm text-amber-800 font-medium">Nueva llave: cópiela ahora, no se volverá a mostrar.</p>
            <CopyValue value={issued} />
            <button className="min-h-[44px] text-sm text-amber-800 underline" onClick={() => setIssued(null)}>Ya la guardé</button>
          </div>
        )}
        <form onSubmit={handleIssue} className="flex flex-wrap gap-2">
          <select aria-label="Rol de la llave" className={`${inputClass} w-auto`} value={newKey.role}
            onChange={(e) => setNewKey({ ...newKey, role: e.target.value as ApiKeyInfo['role'] })}>
            <option value="SCANNER">{ROLE.SCANNER}</option>
            <option value="STAFF">{ROLE.STAFF}</option>
            <option value="PRINCIPAL">{ROLE.PRINCIPAL}</option>
          </select>
          <input required aria-label="Nombre de la llave" placeholder="Nombre, p. ej. Puerta 2" className={`${inputClass} flex-1 min-w-[10rem]`}
            value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} />
          <button type="submit" className={secondaryButton}>Crear llave</button>
        </form>
        <ul className="divide-y divide-slate-100">
          {keys.map((k) => (
            <li key={k.id} className={`py-2 flex items-center justify-between gap-3 text-sm ${k.revokedAt ? 'text-slate-400' : 'text-slate-700'}`}>
              <span className="min-w-0">
                <span className="font-medium">{k.label}</span> · {ROLE[k.role]}
                <span className="block text-xs text-slate-400">Creada {fmtDateTime(k.createdAt)}</span>
              </span>
              {k.revokedAt ? 'Revocada' : (
                <button className="min-h-[44px] px-4 rounded-lg border border-red-200 text-red-700 font-medium shrink-0"
                  onClick={() => window.confirm(`¿Revocar "${k.label}"? Los dispositivos que la usan dejan de funcionar de inmediato.`) &&
                    run(() => revokeKey(id, k.id), T.saveFailed)}>
                  Revocar
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Usuarios">
        <StaffView currentUserId={null} schoolId={id} />
      </Card>
    </div>
  );
}

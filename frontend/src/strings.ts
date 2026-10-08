import axios from 'axios';
import type { AttendanceStatus, MessageStatus, RequestState, UserRole } from './types';

// UI text (es-MX). Shared words, labels and formats live here so every screen says the same thing;
// a sentence used by only one screen stays next to it. Error details come from the API (already Spanish).

export const STATUS: Record<AttendanceStatus, string> = {
  PRESENT: 'Presente',
  TARDY: 'Retardo',
  ABSENT: 'Falta',
  EXCUSED: 'Justificada',
};
export const NO_RECORD = 'Sin registro';

export const ROLE: Record<UserRole | 'SCANNER', string> = {
  STAFF: 'Personal',
  PRINCIPAL: 'Dirección',
  SUPERADMIN: 'Soporte',
  SCANNER: 'Escáner',
};

export const REQUEST_STATE: Record<RequestState, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
};

export const MESSAGE_STATUS: Record<MessageStatus, string> = {
  PENDING: 'por enviar',
  SENDING: 'enviando',
  SENT: 'enviado',
  DELIVERED: 'entregado',
  READ: 'leído',
  FAILED: 'no se pudo enviar',
  EXPIRED: 'no enviado (demasiado tarde)',
};

export const FLAGS = {
  tardy: 'Retardo frecuente',
  absent: 'Faltas frecuentes',
  rule: '3 o más en 30 días',
};

export const T = {
  grade: (g: number) => `${g}.º`,
  gradeGroup: (g: number, group: string) => `${g}.º ${group}`,
  loading: 'Cargando…',
  saving: 'Guardando…',
  save: 'Guardar',
  cancel: 'Cancelar',
  close: 'Cerrar',
  edit: 'Editar',
  add: 'Agregar',
  signOut: 'Cerrar sesión',
  allGrades: 'Todos los grados',
  active: 'Activo',
  inactive: 'Inactivo',
  activate: 'Activar',
  deactivate: 'Desactivar',
  name: 'Nombre',
  email: 'Correo',
  role: 'Rol',
  password: 'Contraseña',
  newPassword: 'Nueva contraseña',
  resetPassword: 'Cambiar contraseña',
  loadFailed: 'No se pudo cargar. Revise su conexión.',
  saveFailed: 'No se pudo guardar. Intente de nuevo.',
};

// es-MX date formats. Dates from the API are YYYY-MM-DD school days: format them in UTC so the day never shifts.
// Only the first letter is capitalized ("Mié 7 de oct"); CSS `capitalize` would also give "De".
const ymdDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtDay = (ymd: string) =>
  cap(ymdDate(ymd).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }));
export const fmtLongDay = (ymd: string) =>
  cap(ymdDate(ymd).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }));
export const fmtMonth = (ymd: string) =>
  cap(ymdDate(ymd).toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

// The API's message when it has one (rule errors are written in Spanish), else a Spanish fallback.
export function errorText(err: unknown, fallback = T.saveFailed): string {
  if (!axios.isAxiosError(err)) return fallback;
  if (!err.response) return 'Sin conexión con el servidor. Revise su internet.';
  const { error, message } = err.response.data ?? {};
  if (error === 'INVALID_INPUT') return 'Revise los datos del formulario.';
  if (error === 'INTERNAL_ERROR' || !message) return fallback;
  return message;
}

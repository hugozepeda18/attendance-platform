// WhatsApp message templates. Each one must be approved by Meta before launch, exactly as written here:
// WhatsApp Manager → Message templates → category **Utility**, language **Spanish (MEX) es_MX**,
// same name. {{1}} is always the school's name, so one platform number serves every school.
// No correction template: guardians never get corrections (decided 2026-10-07).
export const TEMPLATES = {
  entrada: '{{1}}: registro de entrada de {{2}} a las {{3}}.',
  entrada_retardo: '{{1}}: registro de entrada con retardo de {{2}} a las {{3}}.',
  inasistencia: '{{1}}: {{2}} no registró entrada hoy, {{3}}. Si es un error, comuníquese con la escuela.',
  escaner_en_espera:
    '{{1}}: el escáner "{{2}}" no está sincronizado. El registro de inasistencias espera hasta 30 minutos.',
  solicitud_cambio: '{{1}}: {{2}} solicitó un cambio de asistencia para {{3}}. Revísela en la pestaña Solicitudes.',
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export const render = (template: TemplateName, params: string[]) =>
  TEMPLATES[template].replace(/\{\{(\d)\}\}/g, (_, i) => params[Number(i) - 1] ?? '');

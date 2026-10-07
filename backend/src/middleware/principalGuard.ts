import { requireRole } from './auth';

// Manual record updates: authenticated PRINCIPAL (or platform SUPERADMIN) only.
export const principalGuard = requireRole('PRINCIPAL');

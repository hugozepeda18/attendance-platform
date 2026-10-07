// Dev API keys created by prisma/seed.ts. "north" = default-school, "south" = school-b.
export const NORTH = 'default-school';
export const SOUTH = 'school-b';

export const KEYS = {
  northScanner: 'ak_dev_north_scanner',
  northStaff: 'ak_dev_north_staff',
  northPrincipal: 'ak_dev_north_principal',
  southStaff: 'ak_dev_south_staff',
  southPrincipal: 'ak_dev_south_principal',
  superadmin: 'ak_dev_superadmin',
};

export const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

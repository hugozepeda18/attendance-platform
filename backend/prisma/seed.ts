import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword, hashToken } from '../src/lib/tokens';
import { getDateInTimezone } from '../src/services/attendance.service';
import { utcOffsetMinutes } from '../src/services/gate.service';

const prisma = new PrismaClient();

const firstNames = {
  male: ['Santiago', 'Mateo', 'Sebastian', 'Nicolas', 'Diego', 'Alejandro', 'Miguel', 'Carlos', 'Eduardo', 'Juan'],
  female: ['Sofia', 'Valentina', 'Isabella', 'Camila', 'Mariana', 'Andrea', 'Fernanda', 'Daniela', 'Lucia', 'Paula'],
};

const lastNames = ['Garcia', 'Lopez', 'Martinez', 'Hernandez', 'Perez', 'Ramirez', 'Torres', 'Flores', 'Rivera', 'Cruz'];

const guardianFirstNames = ['Roberto', 'Maria', 'Jose', 'Ana', 'Luis', 'Carmen', 'Jorge', 'Rosa', 'Carlos', 'Elena'];

function padNum(n: number): string {
  return String(n).padStart(2, '0');
}

// Dev-only fixed API keys and users so RUNBOOK curls and integration tests can authenticate.
// Users: principal@<slug>.test / staff@<slug>.test, password DEV_PASSWORD.
// Two schools deliberately share badge IDs (CARD-1A-01...) to exercise tenant isolation.
const DEV_SCHOOLS = [
  { id: 'default-school', slug: 'norte', name: 'Secundaria Demo Norte', timezone: 'America/Mexico_City', keyPrefix: 'north' },
  { id: 'school-b', slug: 'sur', name: 'Secundaria Demo Sur', timezone: 'America/Tijuana', keyPrefix: 'south' },
];
const DEV_PASSWORD = 'dev-password-123';
const ROLES: Role[] = ['SCANNER', 'STAFF', 'PRINCIPAL'];

async function seedSchool(school: (typeof DEV_SCHOOLS)[number]) {
  await prisma.school.upsert({
    where: { id: school.id },
    update: { slug: school.slug, name: school.name },
    create: { id: school.id, slug: school.slug, name: school.name },
  });

  for (const role of ['PRINCIPAL', 'STAFF'] as const) {
    const email = `${role.toLowerCase()}@${school.slug}.test`;
    await prisma.user.upsert({
      where: { schoolId_email: { schoolId: school.id, email } },
      update: {},
      create: {
        schoolId: school.id,
        email,
        name: `${role === 'PRINCIPAL' ? 'Director' : 'Prefecto'} ${school.slug}`,
        role,
        passwordHash: await hashPassword(DEV_PASSWORD),
      },
    });
  }

  await prisma.schoolConfig.upsert({
    where: { schoolId: school.id },
    update: {},
    create: {
      schoolId: school.id,
      schoolStartTime: '08:00',
      tardyGraceMinutes: 10,
      absenceCutoffMinutes: 30,
      timezone: school.timezone,
    },
  });

  for (const role of ROLES) {
    const key = `ak_dev_${school.keyPrefix}_${role.toLowerCase()}`;
    await prisma.apiKey.upsert({
      where: { keyHash: hashToken(key) },
      update: {},
      create: { schoolId: school.id, role, label: `dev ${role.toLowerCase()}`, keyHash: hashToken(key) },
    });
  }

  const grades = [1, 2, 3];
  const groups = ['A', 'B'];
  const studentsPerGroup = 5;

  let studentIndex = 0;

  for (const grade of grades) {
    for (const group of groups) {
      for (let i = 1; i <= studentsPerGroup; i++) {
        const isMale = i % 2 !== 0;
        const namePool = isMale ? firstNames.male : firstNames.female;
        // Offset the second school's names so search results are distinguishable
        const nameIndex = studentIndex + (school.id === 'school-b' ? 3 : 0);
        const firstName = namePool[nameIndex % namePool.length];
        const lastName = lastNames[nameIndex % lastNames.length];
        const guardianFirst = guardianFirstNames[nameIndex % guardianFirstNames.length];
        const credentialUid = `CARD-${grade}${group}-${padNum(i)}`;
        const guardianWhatsApp = `+5233123456${padNum(studentIndex + 1)}`;

        await prisma.student.upsert({
          where: { schoolId_credentialUid: { schoolId: school.id, credentialUid } },
          update: {},
          create: {
            schoolId: school.id,
            credentialUid,
            firstName,
            lastName,
            grade,
            group,
            guardianName: `${guardianFirst} ${lastName}`,
            guardianWhatsApp,
          },
        });

        studentIndex++;
      }
    }
  }

  await seedHistory(school.id);
}

const SCHOOL_DAYS = 30;
const HOLIDAYS = ['2026-09-16']; // ponytail: just the one in range; the real calendar is Phase 18

// ~6 weeks of past school days so dashboards aren't empty. Today stays empty for live scans.
// Every 7th student is a "problem" student (more tardies/absences) to give the charts something to show.
// Re-running only fills missing days (skipDuplicates).
async function seedHistory(schoolId: string) {
  const config = (await prisma.schoolConfig.findUniqueOrThrow({ where: { schoolId } }));
  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { credentialUid: 'asc' } });
  const [h, m] = config.schoolStartTime.split(':').map(Number);
  const start = h * 60 + m;
  const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

  const days: Date[] = [];
  const day = getDateInTimezone(config.timezone);
  while (days.length < SCHOOL_DAYS) {
    day.setUTCDate(day.getUTCDate() - 1);
    const dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6 && !HOLIDAYS.includes(day.toISOString().slice(0, 10))) days.push(new Date(day));
  }

  const rows = days.flatMap((date) => {
    const offset = utcOffsetMinutes(config.timezone, date);
    const at = (localMin: number) => new Date(date.getTime() + (localMin - offset) * 60_000);
    return students.map((s, i) => {
      const risky = i % 7 === 0;
      const roll = Math.random();
      if (roll < (risky ? 0.15 : 0.03)) return { studentId: s.id, date, status: 'ABSENT' as const, updatedByRole: 'SYSTEM' as const };
      if (roll < (risky ? 0.17 : 0.05))
        return { studentId: s.id, date, status: 'EXCUSED' as const, updatedByRole: 'STAFF' as const, note: 'Cita médica' };
      if (roll < (risky ? 0.4 : 0.13))
        return { studentId: s.id, date, status: 'TARDY' as const, updatedByRole: 'SCANNER' as const,
          scanTimestamp: at(rand(start + config.tardyGraceMinutes + 1, start + config.absenceCutoffMinutes - 1)) };
      return { studentId: s.id, date, status: 'PRESENT' as const, updatedByRole: 'SCANNER' as const,
        scanTimestamp: at(rand(start - 25, start + config.tardyGraceMinutes)) };
    });
  });
  await prisma.attendanceRecord.createMany({ data: rows, skipDuplicates: true });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production: the seed creates well-known dev API keys');
  }
  console.log('Seeding database...');

  for (const school of DEV_SCHOOLS) await seedSchool(school);

  await prisma.platformAdmin.upsert({
    where: { email: 'owner@platform.test' },
    update: {},
    create: { email: 'owner@platform.test', name: 'Platform Owner (dev)', passwordHash: await hashPassword(DEV_PASSWORD) },
  });

  const [count, records] = await Promise.all([prisma.student.count(), prisma.attendanceRecord.count()]);
  console.log(`Seed complete. Schools: ${DEV_SCHOOLS.length}, total students: ${count}, attendance records: ${records}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

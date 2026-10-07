import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashToken } from '../src/lib/tokens';

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

// Dev-only fixed API keys so RUNBOOK curls and integration tests can authenticate.
// Two schools deliberately share badge IDs (CARD-1A-01...) to exercise tenant isolation.
const DEV_SCHOOLS = [
  { id: 'default-school', name: 'Secundaria Demo Norte', timezone: 'America/Mexico_City', keyPrefix: 'north' },
  { id: 'school-b', name: 'Secundaria Demo Sur', timezone: 'America/Tijuana', keyPrefix: 'south' },
];
const ROLES: Role[] = ['SCANNER', 'STAFF', 'PRINCIPAL'];

async function seedSchool(school: (typeof DEV_SCHOOLS)[number]) {
  await prisma.school.upsert({
    where: { id: school.id },
    update: {},
    create: { id: school.id, name: school.name },
  });

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
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production: the seed creates well-known dev API keys');
  }
  console.log('Seeding database...');

  for (const school of DEV_SCHOOLS) await seedSchool(school);

  const count = await prisma.student.count();
  console.log(`Seed complete. Schools: ${DEV_SCHOOLS.length}, total students: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

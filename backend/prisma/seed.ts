import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

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

async function main() {
  console.log('Seeding database...');

  await prisma.schoolConfig.upsert({
    where: { id: 'default-config' },
    update: {},
    create: {
      id: 'default-config',
      schoolStartTime: '08:00',
      tardyGraceMinutes: 10,
      absenceCutoffMinutes: 30,
      timezone: 'America/Mexico_City',
    },
  });

  const grades = [1, 2, 3];
  const groups = ['A', 'B'];
  const studentsPerGroup = 5;

  let studentIndex = 0;

  for (const grade of grades) {
    for (const group of groups) {
      for (let i = 1; i <= studentsPerGroup; i++) {
        const isMale = i % 2 !== 0;
        const namePool = isMale ? firstNames.male : firstNames.female;
        const firstName = namePool[studentIndex % namePool.length];
        const lastName = lastNames[studentIndex % lastNames.length];
        const guardianFirst = guardianFirstNames[studentIndex % guardianFirstNames.length];
        const credentialUid = `CARD-${grade}${group}-${padNum(i)}`;
        const guardianWhatsApp = `+5233123456${padNum(studentIndex + 1)}`;

        await prisma.student.upsert({
          where: { credentialUid },
          update: {},
          create: {
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

  const count = await prisma.student.count();
  console.log(`Seed complete. Total students: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

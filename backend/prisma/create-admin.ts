// Create (or reset the password of) a platform owner account.
//   npm run create-admin -- you@example.com "Your Name"
// A random password is generated and printed once, so it never lands in shell history.
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/tokens';

const prisma = new PrismaClient();

async function main() {
  const [rawEmail, name = 'Platform Owner'] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run create-admin -- <email> "<name>"');
    process.exit(1);
  }

  const password = randomBytes(15).toString('base64url');
  const passwordHash = await hashPassword(password);
  const existing = await prisma.platformAdmin.findUnique({ where: { email } });

  await prisma.platformAdmin.upsert({
    where: { email },
    update: { passwordHash, active: true },
    create: { email, name, passwordHash },
  });
  if (existing) await prisma.session.updateMany({ where: { adminId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });

  console.log(`${existing ? 'Password reset' : 'Created'} platform admin ${email}`);
  console.log(`Password (shown once): ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

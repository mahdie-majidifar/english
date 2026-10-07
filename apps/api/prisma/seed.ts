import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadRootEnv } from '../src/core/config/load-env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

loadRootEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (see .env.example)`);
  return value;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
});

try {
  const email = required('SEED_USER_EMAIL').trim().toLowerCase();
  const passwordHash = await argon2.hash(required('SEED_USER_PASSWORD'));
  const displayName = process.env['SEED_USER_NAME'] ?? 'Learner';
  const timezone = process.env['SEED_USER_TIMEZONE'] ?? 'Asia/Tehran';

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, displayName, timezone, profile: { create: {} } },
    update: { passwordHash, displayName, timezone },
  });
  console.log(`Seeded user ${user.email} (${user.id})`);
} finally {
  await prisma.$disconnect();
}

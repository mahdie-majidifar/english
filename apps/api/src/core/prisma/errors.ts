import { Prisma } from '../../generated/prisma/client.js';

/** True when a write failed because it violated a unique constraint (Prisma code P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** True when the targeted record does not exist (Prisma code P2025). */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

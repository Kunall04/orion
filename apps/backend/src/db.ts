/**
 * Prisma Database Client — global singleton for PostgreSQL access.
 *
 * In development, hot-reloading (via tsx or nodemon) can cause multiple instances
 * of PrismaClient to be created, exhausting database connection limits.
 * Attaching the client to globalThis ensures a single connection pool is reused.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

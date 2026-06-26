import { PrismaClient } from "@prisma/client";

/**
 * Hot-reload-safe Prisma client singleton.
 *
 * Next.js dev mode recompiles modules on every request — without the global
 * cache, each request would create a new PrismaClient and exhaust the Neon
 * connection pool. In production this branch never runs and `db` is a normal
 * module-scoped singleton.
 *
 * Convention: every database call goes through this `db` import. No code
 * outside this file may call `new PrismaClient()` — see
 * `docs/conventions/coding-conventions.md` §Data layer.
 */
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = db;
}

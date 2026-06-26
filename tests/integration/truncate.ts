import { beforeEach, afterAll } from "vitest";

import { db } from "@/lib/db";

// Clean slate before every integration test: truncate all data tables (keeping
// the Prisma migrations table) so tests never see each other's rows.
beforeEach(async () => {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length === 0) return;
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await db.$executeRawUnsafe(
        `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
    );
});

afterAll(async () => {
    await db.$disconnect();
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { splitStatements } from "@/tests/support/replay-migration";

const MIGRATION = "20261127000000_add_oauth_provider";
const OAUTH_TABLES = [
    "oauthAccessToken",
    "oauthRefreshToken",
    "oauthConsent",
    "oauthClientResource",
    "oauthClient",
    "oauthResource",
    "oauthClientAssertion",
    "jwks",
] as const;
const KEPT_TABLES = [
    "User",
    "account",
    "session",
    "Expense",
    "Movement",
    "Income",
    "Card",
    "Category",
    "Subcategory",
    "CategoryBudget",
    "BudgetRule",
    "Settings",
] as const;
const migrationSql = readFileSync(
    join(process.cwd(), "prisma/migrations", MIGRATION, "migration.sql"),
    "utf8",
);

async function snapshot(tx: Prisma.TransactionClient) {
    const state: Record<string, unknown> = {};
    for (const table of KEPT_TABLES) {
        state[table] = {
            rows: await tx.$queryRawUnsafe(
                `SELECT to_jsonb(t)::text AS row FROM "${table}" t ORDER BY id`,
            ),
            columns: await tx.$queryRawUnsafe(
                `SELECT column_name, data_type, is_nullable, column_default
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1
                 ORDER BY column_name`,
                table,
            ),
        };
    }
    return state;
}

async function seedInventedHistory() {
    const user = await db.user.create({
        data: { email: "oauth-migration@example.com", name: "Invented" },
    });
    const userId = user.id;
    await db.account.create({
        data: {
            id: crypto.randomUUID(),
            userId,
            accountId: userId,
            providerId: "credential",
            password: "invented hash",
        },
    });
    await db.session.create({
        data: {
            id: crypto.randomUUID(),
            userId,
            token: "invented-session-token",
            expiresAt: new Date("2026-12-01T00:00:00Z"),
        },
    });
    const category = await db.category.create({
        data: { userId, slug: "invented", name: "Invented", color: "#123456" },
    });
    const card = await db.card.create({
        data: {
            userId,
            name: "Invented card",
            color: "#654321",
            type: "credit",
        },
    });
    await db.expense.create({
        data: {
            userId,
            categoryId: category.id,
            cardId: card.id,
            date: new Date("2026-03-15T12:00:00Z"),
            description: "Invented purchase",
            amount: 100,
            actualExpenditure: 100,
        },
    });
    await db.settings.create({ data: { userId } });
}

describe("OAuth provider expand migration", () => {
    it("guard: adds the 8 tables and leaves users, sessions and money tables unchanged", async () => {
        await seedInventedHistory();
        const rollback = new Error("Roll back the pre-migration schema");
        await expect(
            db.$transaction(
                async (tx) => {
                    for (const table of OAUTH_TABLES)
                        await tx.$executeRawUnsafe(`DROP TABLE "${table}"`);
                    const before = await snapshot(tx);
                    for (const statement of splitStatements(migrationSql))
                        await tx.$executeRawUnsafe(statement);

                    expect(await snapshot(tx)).toEqual(before);
                    const created = await tx.$queryRawUnsafe<
                        { table_name: string }[]
                    >(
                        `SELECT table_name FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = ANY($1)`,
                        [...OAUTH_TABLES],
                    );
                    expect(created.map((t) => t.table_name).sort()).toEqual(
                        [...OAUTH_TABLES].sort(),
                    );
                    throw rollback;
                },
                { timeout: 60_000 },
            ),
        ).rejects.toBe(rollback);
    });
});

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { splitStatements } from "@/tests/support/replay-migration";

const MIGRATION = "20261031000000_add_better_auth_core";
const FINANCIAL_TABLES = [
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
const AUTH_TABLES = [
    "account",
    "session",
    "verification",
    "rateLimit",
] as const;
const migrationSql = readFileSync(
    join(process.cwd(), "prisma/migrations", MIGRATION, "migration.sql"),
    "utf8",
);

async function snapshot(tx: Prisma.TransactionClient) {
    const rows: Record<string, unknown> = {};
    for (const table of ["User", ...FINANCIAL_TABLES]) {
        const row =
            table === "User"
                ? "to_jsonb(t) - 'emailVerified' - 'image'"
                : "to_jsonb(t)";
        rows[table] = await tx.$queryRawUnsafe(
            `SELECT (${row})::text AS row
             FROM "${table}" t ORDER BY id`,
        );
    }
    rows.foreignKeys = await tx.$queryRawUnsafe(
        `SELECT conrelid::regclass::text AS table_name, conname,
                pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE contype = 'f' AND conrelid::regclass::text NOT IN ('account', 'session')
         ORDER BY conname`,
    );
    return rows;
}

async function seedInventedHistory() {
    const user = await db.user.create({
        data: {
            email: "migration-owner@example.com",
            name: "Invented owner",
            password: await bcrypt.hash("invented legacy password", 10),
            onboardedAt: new Date("2026-01-01T00:00:00Z"),
        },
    });
    await db.user.create({
        data: {
            email: "migration-friend@example.com",
            name: "Invented friend",
            password: "invented second hash",
        },
    });
    const userId = user.id;
    const category = await db.category.create({
        data: {
            userId,
            slug: "invented",
            name: "Invented category",
            color: "#123456",
        },
    });
    const categoryId = category.id;
    const subcategory = await db.subcategory.create({
        data: { userId, categoryId, name: "Invented subcategory" },
    });
    const card = await db.card.create({
        data: {
            userId,
            name: "Invented card",
            color: "#654321",
            type: "credit",
        },
    });
    const date = new Date("2026-03-15T12:00:00Z");
    await db.expense.create({
        data: {
            userId,
            categoryId,
            subcategoryId: subcategory.id,
            cardId: card.id,
            date,
            description: "Invented shared purchase",
            amount: 250,
            isShared: true,
            yourPercentage: 0.68,
            actualExpenditure: 170,
        },
    });
    await db.movement.create({
        data: {
            userId,
            cardId: card.id,
            date,
            amount: 250,
            type: "card_payment",
            note: "Invented payment",
        },
    });
    await db.income.create({
        data: {
            userId,
            type: "FIXED",
            amount: 10000,
            effectiveMonth: "2026-03",
        },
    });
    await db.settings.create({
        data: { userId, sharesExpenses: true, partnerName: "Invented partner" },
    });
    await db.categoryBudget.create({
        data: { userId, categoryId, month: "2026-03", amount: 500 },
    });
    await db.budgetRule.create({
        data: {
            userId,
            effectiveMonth: "2026-03",
            essentials: 50,
            discretionary: 25,
            savings: 25,
        },
    });
}

describe("Better Auth core expand migration", () => {
    it("preserves legacy hashes, every financial table, and existing foreign keys", async () => {
        await seedInventedHistory();
        const rollback = new Error(
            "Roll back the temporary pre-migration schema",
        );

        await expect(
            db.$transaction(
                async (tx) => {
                    // PostgreSQL rolls all DDL back so the normal suite keeps its current schema.
                    for (const table of AUTH_TABLES) {
                        await tx.$executeRawUnsafe(`DROP TABLE "${table}"`);
                    }
                    await tx.$executeRawUnsafe(`ALTER TABLE "User"
                DROP COLUMN "emailVerified", DROP COLUMN "image",
                ALTER COLUMN "password" SET NOT NULL`);
                    const before = await snapshot(tx);
                    for (const statement of splitStatements(migrationSql)) {
                        await tx.$executeRawUnsafe(statement);
                    }

                    expect(await snapshot(tx)).toEqual(before);
                    const users = await tx.user.findMany();
                    expect(users).toHaveLength(2);
                    expect(
                        users.every(
                            (user) =>
                                !user.emailVerified && user.image === null,
                        ),
                    ).toBe(true);
                    for (const table of AUTH_TABLES) {
                        expect(
                            await tx.$queryRawUnsafe(
                                `SELECT count(*)::int AS count FROM "${table}"`,
                            ),
                        ).toEqual([{ count: 0 }]);
                    }
                    const owner = users.find(
                        (user) => user.email === "migration-owner@example.com",
                    )!;
                    expect(
                        await bcrypt.compare(
                            "invented legacy password",
                            owner.password!,
                        ),
                    ).toBe(true);
                    await tx.user.create({
                        data: {
                            email: "no-password@example.com",
                            name: "Invented new user",
                            password: null,
                        },
                    });
                    throw rollback;
                },
                { timeout: 60_000 },
            ),
        ).rejects.toBe(rollback);
    });

    it("does not replay an applied migration when migrate deploy runs again", async () => {
        await seedInventedHistory();
        const before = await snapshot(db);
        const history =
            await db.$queryRaw`SELECT * FROM "_prisma_migrations" ORDER BY id`;
        execFileSync(
            join(process.cwd(), "node_modules/.bin/prisma"),
            ["migrate", "deploy"],
            {
                env: {
                    ...process.env,
                    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL,
                },
                stdio: "pipe",
            },
        );
        expect(await snapshot(db)).toEqual(before);
        expect(
            await db.$queryRaw`SELECT * FROM "_prisma_migrations" ORDER BY id`,
        ).toEqual(history);
        expect(
            await db.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
        ).toEqual([{ count: 1 }]);
    });
});

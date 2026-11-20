import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { PrismaUserProvisioningRepository } from "@/lib/repositories/user-provisioning.repository";
import { replayMigration } from "@/tests/support/replay-migration";

const MIGRATION = "20261119000000_add_vacation_subcategory";
const repo = new PrismaUserProvisioningRepository(db);

async function createUser(email: string) {
    return db.user.create({ data: { email, name: "Test" } });
}

async function createCategory(userId: string, slug = "disposable-income") {
    return db.category.create({
        data: { userId, slug, name: "Custom category", isRelevant: false },
    });
}

async function vacations(userId: string, categoryId: string) {
    return db.subcategory.findMany({
        where: { userId, categoryId, name: "Vacation" },
    });
}

describe("Vacation subcategory rollout", () => {
    it("adds one row for each existing account and changes no existing rows or expenses", async () => {
        const first = await createUser("first@example.com");
        const second = await createUser("second@example.com");
        const category = await createCategory(first.id);
        const secondCategory = await createCategory(second.id);
        const existing = await db.subcategory.create({
            data: {
                userId: first.id,
                categoryId: category.id,
                name: "Dining out",
            },
        });
        const expense = await db.expense.create({
            data: {
                userId: first.id,
                categoryId: category.id,
                subcategoryId: existing.id,
                date: new Date("2026-11-01T12:00:00Z"),
                description: "Invented meal",
                amount: 100,
                isShared: true,
                yourPercentage: 0.5,
                actualExpenditure: 50,
                fundedFrom: "savings",
            },
        });

        await replayMigration(MIGRATION);

        const rows = await vacations(first.id, category.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            userId: first.id,
            categoryId: category.id,
        });
        expect(rows[0]!.createdAt).toBeInstanceOf(Date);
        expect(rows[0]!.updatedAt).toEqual(rows[0]!.createdAt);
        expect(await vacations(second.id, secondCategory.id)).toHaveLength(1);
        expect(
            await db.category.findUniqueOrThrow({ where: { id: category.id } }),
        ).toEqual(category);
        expect(
            await db.subcategory.findUniqueOrThrow({
                where: { id: existing.id },
            }),
        ).toEqual(existing);
        expect(
            await db.expense.findUniqueOrThrow({ where: { id: expense.id } }),
        ).toEqual(expense);
    });

    it("preserves an existing Vacation and is a no-op on replay and re-provisioning", async () => {
        const user = await createUser("held@example.com");
        await repo.provisionNewUser(user.id);
        const category = await db.category.findUniqueOrThrow({
            where: {
                userId_slug: { userId: user.id, slug: "disposable-income" },
            },
        });
        // Recreate a legacy account's own exact-name row, independent of defaults.
        await db.subcategory.deleteMany({
            where: {
                userId: user.id,
                categoryId: category.id,
                name: "Vacation",
            },
        });
        const held = await db.subcategory.create({
            data: {
                userId: user.id,
                categoryId: category.id,
                name: "Vacation",
                createdAt: new Date("2026-01-01Z"),
                updatedAt: new Date("2026-01-01Z"),
            },
        });

        await replayMigration(MIGRATION);
        await replayMigration(MIGRATION);
        await repo.provisionNewUser(user.id);

        expect(await vacations(user.id, category.id)).toEqual([held]);
    });

    it("matches the exact name within the same owner and category only", async () => {
        const user = await createUser("scoped@example.com");
        const other = await createUser("other@example.com");
        const category = await createCategory(user.id);
        const elsewhere = await createCategory(user.id, "personal");
        const otherCategory = await createCategory(other.id);
        const otherRow = await db.subcategory.create({
            data: {
                userId: other.id,
                categoryId: otherCategory.id,
                name: "Vacation",
            },
        });
        const elsewhereRow = await db.subcategory.create({
            data: {
                userId: user.id,
                categoryId: elsewhere.id,
                name: "Vacation",
            },
        });
        const lowerCase = await db.subcategory.create({
            data: {
                userId: user.id,
                categoryId: category.id,
                name: "vacation",
            },
        });

        await replayMigration(MIGRATION);

        expect(await vacations(user.id, category.id)).toHaveLength(1);
        expect(await vacations(user.id, elsewhere.id)).toEqual([elsewhereRow]);
        expect(await vacations(other.id, otherCategory.id)).toEqual([otherRow]);
        expect(
            await db.subcategory.findUniqueOrThrow({
                where: { id: lowerCase.id },
            }),
        ).toEqual(lowerCase);
    });

    it("leaves an account without categories alone until provisioning supplies the updated defaults", async () => {
        const user = await createUser("empty@example.com");

        await replayMigration(MIGRATION);
        expect(await db.subcategory.count()).toBe(0);
        expect(await db.category.count()).toBe(0);
        await repo.provisionNewUser(user.id);

        const category = await db.category.findUniqueOrThrow({
            where: {
                userId_slug: { userId: user.id, slug: "disposable-income" },
            },
        });
        expect(await vacations(user.id, category.id)).toHaveLength(1);
    });

    it("gives a new signup Vacation under Disposable Income", async () => {
        const { userId } = await repo.createUserWithStarterKit({
            name: "Invented User",
            email: "signup@example.com",
            password: "Invented-pass-123",
        });
        const category = await db.category.findUniqueOrThrow({
            where: { userId_slug: { userId, slug: "disposable-income" } },
        });

        expect(await vacations(userId, category.id)).toHaveLength(1);
    });
});

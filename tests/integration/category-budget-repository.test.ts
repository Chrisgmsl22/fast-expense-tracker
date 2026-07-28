import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaCategoryBudgetRepository } from "@/lib/repositories/category-budget.repository";

const repo = new PrismaCategoryBudgetRepository(db);

let userSeq = 0;
async function seedUser() {
    userSeq += 1;
    return db.user.create({
        data: { email: `u${userSeq}@example.com`, password: "x", name: "Test" },
    });
}

async function seedCategory(
    userId: string,
    slug: string,
    monthlyBudget: number | null = null,
) {
    return db.category.create({
        data: { userId, slug, name: slug, monthlyBudget },
    });
}

describe("PrismaCategoryBudgetRepository (integration)", () => {
    it("returns null when a category+month has no override", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id, "health");
        expect(await repo.getOverride(user.id, cat.id, "2026-06")).toBeNull();
    });

    it("setBudget writes the default and upserts the month override together", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id, "health", 1500);
        await repo.setBudget(user.id, cat.id, "2026-06", 2500, 1800);
        expect(await repo.getOverride(user.id, cat.id, "2026-06")).toBe(1800);
        expect(
            (await db.category.findUnique({ where: { id: cat.id } }))
                ?.monthlyBudget,
        ).toBe(2500);

        // Same (categoryId, month) → update, not a duplicate row.
        await repo.setBudget(user.id, cat.id, "2026-06", 2500, 2000);
        expect(await repo.getOverride(user.id, cat.id, "2026-06")).toBe(2000);
        const rows = await db.categoryBudget.findMany({
            where: { categoryId: cat.id, month: "2026-06" },
        });
        expect(rows).toHaveLength(1);
    });

    it("setBudget with null thisMonth clears the override (keeps the default)", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id, "health");
        await repo.setBudget(user.id, cat.id, "2026-06", 1500, 1800);
        expect(await repo.getOverride(user.id, cat.id, "2026-06")).toBe(1800);

        await repo.setBudget(user.id, cat.id, "2026-06", 1500, null);
        expect(await repo.getOverride(user.id, cat.id, "2026-06")).toBeNull();
        expect(
            (await db.category.findUnique({ where: { id: cat.id } }))
                ?.monthlyBudget,
        ).toBe(1500);
    });

    it("setBudget with null default clears the default", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id, "health", 1500);
        await repo.setBudget(user.id, cat.id, "2026-06", null, null);
        expect(
            (await db.category.findUnique({ where: { id: cat.id } }))
                ?.monthlyBudget,
        ).toBeNull();
    });

    it("scopes overrides by month", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id, "health");
        await repo.setBudget(user.id, cat.id, "2026-06", null, 1800);
        expect(await repo.getOverride(user.id, cat.id, "2026-07")).toBeNull();
    });

    it("maps overrides for several categories in a month, absent when unset", async () => {
        const user = await seedUser();
        const health = await seedCategory(user.id, "health");
        const food = await seedCategory(user.id, "food");
        const transport = await seedCategory(user.id, "transport");
        await repo.setBudget(user.id, health.id, "2026-06", null, 1800);
        await repo.setBudget(user.id, food.id, "2026-06", null, 6000);
        // transport has an override only in another month → absent from June.
        await repo.setBudget(user.id, transport.id, "2026-05", null, 999);

        const map = await repo.getOverridesForMonth(
            user.id,
            [health.id, food.id, transport.id],
            "2026-06",
        );
        expect(map.get(health.id)).toBe(1800);
        expect(map.get(food.id)).toBe(6000);
        expect(map.has(transport.id)).toBe(false);
    });

    describe("per-user isolation (ADR-0022)", () => {
        it("getOverride never reads another user's override", async () => {
            const alice = await seedUser();
            const bob = await seedUser();
            const aliceCat = await seedCategory(alice.id, "health");
            await repo.setBudget(alice.id, aliceCat.id, "2026-06", null, 1800);

            // Bob asking for Alice's categoryId gets nothing — the override is
            // keyed on (userId, categoryId, month).
            expect(
                await repo.getOverride(bob.id, aliceCat.id, "2026-06"),
            ).toBeNull();
            // Alice still sees her own.
            expect(
                await repo.getOverride(alice.id, aliceCat.id, "2026-06"),
            ).toBe(1800);
        });

        it("getOverridesForMonth omits another user's overrides", async () => {
            const alice = await seedUser();
            const bob = await seedUser();
            const aliceCat = await seedCategory(alice.id, "health");
            await repo.setBudget(alice.id, aliceCat.id, "2026-06", null, 1800);

            const map = await repo.getOverridesForMonth(
                bob.id,
                [aliceCat.id],
                "2026-06",
            );
            expect(map.size).toBe(0);
        });

        it("two users hold independent overrides for the same slug + month", async () => {
            const alice = await seedUser();
            const bob = await seedUser();
            const aliceHealth = await seedCategory(alice.id, "health");
            const bobHealth = await seedCategory(bob.id, "health");
            await repo.setBudget(
                alice.id,
                aliceHealth.id,
                "2026-06",
                null,
                1800,
            );
            await repo.setBudget(bob.id, bobHealth.id, "2026-06", null, 4200);

            expect(
                await repo.getOverride(alice.id, aliceHealth.id, "2026-06"),
            ).toBe(1800);
            expect(
                await repo.getOverride(bob.id, bobHealth.id, "2026-06"),
            ).toBe(4200);
        });

        it("setBudget cannot change another user's category default", async () => {
            const alice = await seedUser();
            const bob = await seedUser();
            const aliceCat = await seedCategory(alice.id, "health", 1500);

            // Bob passes Alice's category id (the action never does this — it
            // resolves the id via getBySlug(userId) — but the repo must still be
            // safe). The default write is `updateMany` scoped by userId, so it
            // matches zero rows and Alice's default is untouched.
            await repo.setBudget(bob.id, aliceCat.id, "2026-06", 9999, 8888);

            expect(
                (await db.category.findUnique({ where: { id: aliceCat.id } }))
                    ?.monthlyBudget,
            ).toBe(1500);
            // Alice sees no override for her category — Bob's override landed
            // under bob.id, invisible to Alice's userId-scoped read.
            expect(
                await repo.getOverride(alice.id, aliceCat.id, "2026-06"),
            ).toBeNull();
        });
    });
});

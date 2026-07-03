import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaCategoryBudgetRepository } from "@/lib/repositories/category-budget.repository";

const repo = new PrismaCategoryBudgetRepository(db);

async function seedCategory(slug: string, monthlyBudget: number | null = null) {
    return db.category.create({
        data: { slug, name: slug, monthlyBudget },
    });
}

describe("PrismaCategoryBudgetRepository (integration)", () => {
    it("returns null when a category+month has no override", async () => {
        const cat = await seedCategory("health");
        expect(await repo.getOverride(cat.id, "2026-06")).toBeNull();
    });

    it("setBudget writes the default and upserts the month override together", async () => {
        const cat = await seedCategory("health", 1500);
        await repo.setBudget(cat.id, "2026-06", 2500, 1800);
        expect(await repo.getOverride(cat.id, "2026-06")).toBe(1800);
        expect(
            (await db.category.findUnique({ where: { id: cat.id } }))
                ?.monthlyBudget,
        ).toBe(2500);

        // Same (categoryId, month) → update, not a duplicate row.
        await repo.setBudget(cat.id, "2026-06", 2500, 2000);
        expect(await repo.getOverride(cat.id, "2026-06")).toBe(2000);
        const rows = await db.categoryBudget.findMany({
            where: { categoryId: cat.id, month: "2026-06" },
        });
        expect(rows).toHaveLength(1);
    });

    it("setBudget with null thisMonth clears the override (keeps the default)", async () => {
        const cat = await seedCategory("health");
        await repo.setBudget(cat.id, "2026-06", 1500, 1800);
        expect(await repo.getOverride(cat.id, "2026-06")).toBe(1800);

        await repo.setBudget(cat.id, "2026-06", 1500, null);
        expect(await repo.getOverride(cat.id, "2026-06")).toBeNull();
        expect(
            (await db.category.findUnique({ where: { id: cat.id } }))
                ?.monthlyBudget,
        ).toBe(1500);
    });

    it("setBudget with null default clears the default", async () => {
        const cat = await seedCategory("health", 1500);
        await repo.setBudget(cat.id, "2026-06", null, null);
        expect(
            (await db.category.findUnique({ where: { id: cat.id } }))
                ?.monthlyBudget,
        ).toBeNull();
    });

    it("scopes overrides by month", async () => {
        const cat = await seedCategory("health");
        await repo.setBudget(cat.id, "2026-06", null, 1800);
        expect(await repo.getOverride(cat.id, "2026-07")).toBeNull();
    });

    it("maps overrides for several categories in a month, absent when unset", async () => {
        const health = await seedCategory("health");
        const food = await seedCategory("food");
        const transport = await seedCategory("transport");
        await repo.setBudget(health.id, "2026-06", null, 1800);
        await repo.setBudget(food.id, "2026-06", null, 6000);
        // transport has an override only in another month → absent from June.
        await repo.setBudget(transport.id, "2026-05", null, 999);

        const map = await repo.getOverridesForMonth(
            [health.id, food.id, transport.id],
            "2026-06",
        );
        expect(map.get(health.id)).toBe(1800);
        expect(map.get(food.id)).toBe(6000);
        expect(map.has(transport.id)).toBe(false);
    });
});

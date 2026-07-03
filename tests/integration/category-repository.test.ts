import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaCategoryRepository } from "@/lib/repositories/category.repository";

const repo = new PrismaCategoryRepository(db);

async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

async function seedCategory(
    slug: string,
    isRelevant = true,
    monthlyBudget: number | null = null,
) {
    return db.category.create({
        data: { slug, name: slug, isRelevant, monthlyBudget },
    });
}

async function seedSubcategory(categoryId: string, name: string) {
    return db.subcategory.create({ data: { categoryId, name } });
}

async function seedExpense(opts: {
    userId: string;
    categoryId: string;
    date: string;
    amount: number;
    actualExpenditure: number;
    subcategoryId?: string;
}) {
    return db.expense.create({
        data: {
            userId: opts.userId,
            categoryId: opts.categoryId,
            subcategoryId: opts.subcategoryId ?? null,
            date: new Date(opts.date),
            description: "x",
            amount: opts.amount,
            actualExpenditure: opts.actualExpenditure,
        },
    });
}

describe("PrismaCategoryRepository.getBySlug (integration)", () => {
    it("returns category metadata by slug", async () => {
        await seedCategory("health", true, 4000);
        const meta = await repo.getBySlug("health");
        expect(meta).toMatchObject({
            slug: "health",
            name: "health",
            isRelevant: true,
            monthlyBudget: 4000,
        });
    });

    it("returns null for an unknown slug", async () => {
        expect(await repo.getBySlug("nope")).toBeNull();
    });
});

describe("PrismaCategoryRepository.getSubcategorySpends (integration)", () => {
    it("sums my-share per subcategory and keeps zero-spend subcategories", async () => {
        const user = await seedUser();
        const health = await seedCategory("health");
        const doctors = await seedSubcategory(health.id, "Doctors appt");
        const dentist = await seedSubcategory(health.id, "Dentist");
        await seedSubcategory(health.id, "Medicine"); // exists, no spend

        // Two doctor rows — sum on actualExpenditure, not amount.
        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            subcategoryId: doctors.id,
            date: "2026-06-05T12:00:00Z",
            amount: 1000,
            actualExpenditure: 900,
        });
        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            subcategoryId: doctors.id,
            date: "2026-06-19T12:00:00Z",
            amount: 500,
            actualExpenditure: 500,
        });
        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            subcategoryId: dentist.id,
            date: "2026-06-14T12:00:00Z",
            amount: 1100,
            actualExpenditure: 1100,
        });

        const rows = await repo.getSubcategorySpends(
            user.id,
            health.id,
            "2026-06",
        );
        const byName = Object.fromEntries(rows.map((r) => [r.name, r.spent]));
        expect(byName["Doctors appt"]).toBe(1400);
        expect(byName["Dentist"]).toBe(1100);
        expect(byName["Medicine"]).toBe(0); // zero-spend subcategory kept
        // No null-subcategory expense → no "Other" row.
        expect(rows.some((r) => r.id === null)).toBe(false);
    });

    it("rolls null-subcategory spend up as an 'Other' row (only when present)", async () => {
        const user = await seedUser();
        const health = await seedCategory("health");
        const doctors = await seedSubcategory(health.id, "Doctors appt");

        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            subcategoryId: doctors.id,
            date: "2026-06-05T12:00:00Z",
            amount: 900,
            actualExpenditure: 900,
        });
        // No subcategory → rolls up as "Other".
        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            date: "2026-06-06T12:00:00Z",
            amount: 300,
            actualExpenditure: 300,
        });

        const rows = await repo.getSubcategorySpends(
            user.id,
            health.id,
            "2026-06",
        );
        const other = rows.find((r) => r.id === null);
        expect(other).toEqual({ id: null, name: "Other", spent: 300 });
    });

    it("scopes to the user, category, and month", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const health = await seedCategory("health");
        const sub = await seedSubcategory(health.id, "Doctors appt");
        const food = await seedCategory("food");

        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            subcategoryId: sub.id,
            date: "2026-06-10T12:00:00Z",
            amount: 100,
            actualExpenditure: 100,
        });
        // Out of month, another category, another user — all excluded.
        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            subcategoryId: sub.id,
            date: "2026-05-10T12:00:00Z",
            amount: 999,
            actualExpenditure: 999,
        });
        await seedExpense({
            userId: user.id,
            categoryId: food.id,
            date: "2026-06-11T12:00:00Z",
            amount: 888,
            actualExpenditure: 888,
        });
        await seedExpense({
            userId: other.id,
            categoryId: health.id,
            subcategoryId: sub.id,
            date: "2026-06-15T12:00:00Z",
            amount: 777,
            actualExpenditure: 777,
        });

        const rows = await repo.getSubcategorySpends(
            user.id,
            health.id,
            "2026-06",
        );
        expect(rows).toEqual([
            { id: sub.id, name: "Doctors appt", spent: 100 },
        ]);
    });
});

describe("PrismaCategoryRepository.getExpensesForCategoryMonth (integration)", () => {
    it("returns the category's month expenses, date desc, scoped to user+category", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const health = await seedCategory("health");
        const sub = await seedSubcategory(health.id, "Doctors appt");
        const food = await seedCategory("food");

        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            subcategoryId: sub.id,
            date: "2026-06-05T12:00:00Z",
            amount: 100,
            actualExpenditure: 100,
        });
        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            date: "2026-06-20T12:00:00Z",
            amount: 200,
            actualExpenditure: 200,
        });
        // Another category / user / month — excluded.
        await seedExpense({
            userId: user.id,
            categoryId: food.id,
            date: "2026-06-11T12:00:00Z",
            amount: 888,
            actualExpenditure: 888,
        });
        await seedExpense({
            userId: other.id,
            categoryId: health.id,
            date: "2026-06-15T12:00:00Z",
            amount: 777,
            actualExpenditure: 777,
        });

        const rows = await repo.getExpensesForCategoryMonth(
            user.id,
            health.id,
            "2026-06",
        );
        expect(rows.map((r) => r.amount)).toEqual([200, 100]); // date desc
        expect(rows[1]!.subcategory).toEqual({ name: "Doctors appt" });
    });
});

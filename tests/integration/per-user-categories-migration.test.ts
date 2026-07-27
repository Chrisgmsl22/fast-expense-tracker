import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";

// Verifies the schema-level outcome of the per-user-categories migration
// (ADR-0022 / 20260726000000_per_user_categories_budgets): userId is required
// on Category / Subcategory / CategoryBudget, slug is unique **per user**, and
// the budget override key is `(userId, categoryId, month)`. The dev/prod data
// backfill (existing rows → owner) is verified out-of-band against real data
// (see docs/operations/per-user-categories-migration.md); here we assert the
// constraints the migration installs.

let seq = 0;
async function seedUser() {
    seq += 1;
    return db.user.create({
        data: { email: `m${seq}@example.com`, password: "x", name: "Test" },
    });
}

describe("per-user categories migration (ADR-0022)", () => {
    it("requires userId on a Category (FK to a real user)", async () => {
        await expect(
            db.category.create({
                data: { userId: "no-such-user", slug: "housing", name: "H" },
            }),
        ).rejects.toThrow();
    });

    it("allows two different users to own the same slug", async () => {
        const alice = await seedUser();
        const bob = await seedUser();
        await db.category.create({
            data: { userId: alice.id, slug: "housing", name: "Housing" },
        });
        await expect(
            db.category.create({
                data: { userId: bob.id, slug: "housing", name: "Housing" },
            }),
        ).resolves.toMatchObject({ slug: "housing" });
    });

    it("rejects a duplicate slug for the SAME user", async () => {
        const alice = await seedUser();
        await db.category.create({
            data: { userId: alice.id, slug: "housing", name: "Housing" },
        });
        await expect(
            db.category.create({
                data: { userId: alice.id, slug: "housing", name: "Dup" },
            }),
        ).rejects.toThrow();
    });

    it("keys a budget override on (userId, categoryId, month)", async () => {
        const alice = await seedUser();
        const cat = await db.category.create({
            data: { userId: alice.id, slug: "groceries", name: "Groceries" },
        });
        await db.categoryBudget.create({
            data: {
                userId: alice.id,
                categoryId: cat.id,
                month: "2026-06",
                amount: 5000,
            },
        });
        // Same (userId, categoryId, month) → unique violation.
        await expect(
            db.categoryBudget.create({
                data: {
                    userId: alice.id,
                    categoryId: cat.id,
                    month: "2026-06",
                    amount: 6000,
                },
            }),
        ).rejects.toThrow();
    });
});

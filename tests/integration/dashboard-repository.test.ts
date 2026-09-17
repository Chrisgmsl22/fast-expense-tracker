import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaDashboardRepository } from "@/lib/repositories/dashboard.repository";

const repo = new PrismaDashboardRepository(db);

async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

async function seedCategory(
    userId: string,
    slug: string,
    isRelevant = true,
    monthlyBudget: number | null = null,
) {
    return db.category.create({
        data: { userId, slug, name: slug, isRelevant, monthlyBudget },
    });
}

async function seedExpense(opts: {
    userId: string;
    categoryId: string;
    date: string;
    amount: number;
    actualExpenditure: number;
    subcategoryId?: string;
    cardId?: string;
    fundedFrom?: string;
    isPartnerPayment?: boolean;
}) {
    return db.expense.create({
        data: {
            userId: opts.userId,
            categoryId: opts.categoryId,
            subcategoryId: opts.subcategoryId ?? null,
            cardId: opts.cardId ?? null,
            date: new Date(opts.date),
            description: "x",
            amount: opts.amount,
            actualExpenditure: opts.actualExpenditure,
            ...(opts.fundedFrom ? { fundedFrom: opts.fundedFrom } : {}),
            isPartnerPayment: opts.isPartnerPayment ?? false,
        },
    });
}

describe("PrismaDashboardRepository.getCategorySpends (integration)", () => {
    it("returns an empty array for a month with no expenses", async () => {
        const user = await seedUser();
        expect(await repo.getCategorySpends(user.id, "2026-06")).toEqual([]);
    });

    it("sums my-share (actualExpenditure) per category, with slug + isRelevant", async () => {
        const user = await seedUser();
        const housing = await seedCategory(user.id, "housing", true);
        const fun = await seedCategory(user.id, "disposable-income", false);

        // Two housing rows in-month — should sum on actualExpenditure, not amount.
        await seedExpense({
            userId: user.id,
            categoryId: housing.id,
            date: "2026-06-05T12:00:00Z",
            amount: 1000,
            actualExpenditure: 680,
        });
        await seedExpense({
            userId: user.id,
            categoryId: housing.id,
            date: "2026-06-20T12:00:00Z",
            amount: 500,
            actualExpenditure: 500,
        });
        await seedExpense({
            userId: user.id,
            categoryId: fun.id,
            date: "2026-06-10T12:00:00Z",
            amount: 300,
            actualExpenditure: 300,
        });

        const rows = await repo.getCategorySpends(user.id, "2026-06");
        const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
        // name = slug (seed helper), color = schema default hex.
        expect(bySlug.housing).toEqual({
            slug: "housing",
            name: "housing",
            color: "#6b7280",
            isRelevant: true,
            spent: 1180,
        });
        expect(bySlug["disposable-income"]).toEqual({
            slug: "disposable-income",
            name: "disposable-income",
            color: "#6b7280",
            isRelevant: false,
            spent: 300,
        });
    });

    it("excludes other months and other users", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const cat = await seedCategory(user.id, "housing", true);

        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-10T12:00:00Z",
            amount: 100,
            actualExpenditure: 100,
        });
        // Out of month + another user's in-month row — both excluded.
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-05-10T12:00:00Z",
            amount: 999,
            actualExpenditure: 999,
        });
        await seedExpense({
            userId: other.id,
            categoryId: cat.id,
            date: "2026-06-15T12:00:00Z",
            amount: 777,
            actualExpenditure: 777,
        });

        const rows = await repo.getCategorySpends(user.id, "2026-06");
        expect(rows).toEqual([
            {
                slug: "housing",
                name: "housing",
                color: "#6b7280",
                isRelevant: true,
                spent: 100,
            },
        ]);
    });
});

describe("PrismaDashboardRepository.getCardSpends (integration)", () => {
    async function seedCard(userId: string, name: string, color: string) {
        return db.card.create({
            data: { userId, name, color, type: "credit" },
        });
    }

    it("returns an empty array for a month with no expenses", async () => {
        const user = await seedUser();
        expect(await repo.getCardSpends(user.id, "2026-06")).toEqual([]);
    });

    it("sums my-share per card high→low and rolls null-card spend up as Cash", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id, "housing", true);
        const bbva = await seedCard(user.id, "BBVA", "#2563eb");

        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-05T12:00:00Z",
            amount: 1000,
            actualExpenditure: 800,
        });
        // Reassign the first row to BBVA (seedExpense defaults cardId null = cash).
        await db.expense.updateMany({
            where: { userId: user.id },
            data: { cardId: bbva.id },
        });
        // A cash row (cardId null).
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-08T12:00:00Z",
            amount: 300,
            actualExpenditure: 300,
        });

        const rows = await repo.getCardSpends(user.id, "2026-06");
        expect(rows).toEqual([
            { id: bbva.id, name: "BBVA", color: "#2563eb", spent: 800 },
            { id: "cash", name: "Cash", color: "#16a34a", spent: 300 },
        ]);
    });

    it("scopes to the user + month", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const cat = await seedCategory(user.id, "housing", true);

        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-10T12:00:00Z",
            amount: 100,
            actualExpenditure: 100,
        });
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-05-10T12:00:00Z",
            amount: 999,
            actualExpenditure: 999,
        });
        await seedExpense({
            userId: other.id,
            categoryId: cat.id,
            date: "2026-06-15T12:00:00Z",
            amount: 777,
            actualExpenditure: 777,
        });

        const rows = await repo.getCardSpends(user.id, "2026-06");
        expect(rows).toEqual([
            { id: "cash", name: "Cash", color: "#16a34a", spent: 100 },
        ]);
    });

    it("excludes savings (a transfer, not card spend)", async () => {
        const user = await seedUser();
        const groceries = await seedCategory(user.id, "groceries", true);
        const savings = await seedCategory(user.id, "savings", true);

        await seedExpense({
            userId: user.id,
            categoryId: groceries.id,
            date: "2026-06-10T12:00:00Z",
            amount: 300,
            actualExpenditure: 300,
        });
        // Savings contribution (null card) — must NOT appear as a Cash segment.
        await seedExpense({
            userId: user.id,
            categoryId: savings.id,
            date: "2026-06-11T12:00:00Z",
            amount: 5000,
            actualExpenditure: 5000,
        });

        const rows = await repo.getCardSpends(user.id, "2026-06");
        expect(rows).toEqual([
            { id: "cash", name: "Cash", color: "#16a34a", spent: 300 },
        ]);
    });
});

describe("PrismaDashboardRepository.getCategoryBreakdown (integration)", () => {
    async function seedSubcategory(
        userId: string,
        categoryId: string,
        name: string,
    ) {
        return db.subcategory.create({ data: { userId, categoryId, name } });
    }

    it("returns budget + spend + N-of-M subcats, excluding Unassigned, high→low", async () => {
        const user = await seedUser();
        const housing = await seedCategory(user.id, "housing", true, 14000);
        const rent = await seedSubcategory(user.id, housing.id, "Rent");
        await seedSubcategory(user.id, housing.id, "Mortgage"); // exists, no spend
        const groceries = await seedCategory(user.id, "groceries", true, 5000);
        const gro = await seedSubcategory(user.id, groceries.id, "Groceries");
        const unassigned = await seedCategory(user.id, "unassigned", false);

        // Housing: two rows, one subcategorized (Rent), one not → 1 of 2 subcats.
        await seedExpense({
            userId: user.id,
            categoryId: housing.id,
            subcategoryId: rent.id,
            date: "2026-06-05T12:00:00Z",
            amount: 8000,
            actualExpenditure: 8000,
        });
        await seedExpense({
            userId: user.id,
            categoryId: housing.id,
            date: "2026-06-06T12:00:00Z",
            amount: 500,
            actualExpenditure: 500,
        });
        await seedExpense({
            userId: user.id,
            categoryId: groceries.id,
            subcategoryId: gro.id,
            date: "2026-06-10T12:00:00Z",
            amount: 3200,
            actualExpenditure: 3200,
        });
        // Unassigned spend — must be excluded from the grid.
        await seedExpense({
            userId: user.id,
            categoryId: unassigned.id,
            date: "2026-06-11T12:00:00Z",
            amount: 999,
            actualExpenditure: 999,
        });

        const rows = await repo.getCategoryBreakdown(user.id, "2026-06");
        expect(rows.map((r) => r.slug)).toEqual(["housing", "groceries"]); // high→low, no unassigned
        expect(rows[0]).toEqual({
            slug: "housing",
            name: "housing",
            color: "#6b7280",
            monthlyBudget: 14000,
            spent: 8500,
            subcatTotal: 2,
            subcatWithSpend: 1,
        });
        expect(rows[1]).toMatchObject({
            slug: "groceries",
            monthlyBudget: 5000,
            spent: 3200,
            subcatTotal: 1,
            subcatWithSpend: 1,
        });
    });

    it("carries a null budget through as null", async () => {
        const user = await seedUser();
        const debt = await seedCategory(user.id, "debt", true, null);
        await seedExpense({
            userId: user.id,
            categoryId: debt.id,
            date: "2026-06-10T12:00:00Z",
            amount: 900,
            actualExpenditure: 900,
        });

        const [row] = await repo.getCategoryBreakdown(user.id, "2026-06");
        expect(row?.monthlyBudget).toBeNull();
        expect(row?.spent).toBe(900);
    });

    it("resolves the per-month budget override over the default (ADR-0016)", async () => {
        const user = await seedUser();
        const groceries = await seedCategory(user.id, "groceries", true, 5000); // default
        await db.categoryBudget.create({
            data: {
                userId: user.id,
                categoryId: groceries.id,
                month: "2026-06",
                amount: 6500,
            },
        });
        // Override for a different month must NOT affect June.
        await db.categoryBudget.create({
            data: {
                userId: user.id,
                categoryId: groceries.id,
                month: "2026-05",
                amount: 1000,
            },
        });
        await seedExpense({
            userId: user.id,
            categoryId: groceries.id,
            date: "2026-06-10T12:00:00Z",
            amount: 3200,
            actualExpenditure: 3200,
        });

        const [june] = await repo.getCategoryBreakdown(user.id, "2026-06");
        expect(june?.monthlyBudget).toBe(6500); // override wins for June
    });
});

describe("PrismaDashboardRepository per-user isolation (ADR-0022)", () => {
    async function seedSubcategory(
        userId: string,
        categoryId: string,
        name: string,
    ) {
        return db.subcategory.create({ data: { userId, categoryId, name } });
    }

    it("getCategoryBreakdown reads the signed-in user's own color + budget", async () => {
        const alice = await seedUser("alice@example.com");
        const bob = await seedUser("bob@example.com");
        // Same slug, different per-user color + budget.
        const aliceGro = await seedCategory(alice.id, "groceries", true, 5000);
        await seedCategory(bob.id, "groceries", true, 9999);
        await db.category.update({
            where: { id: aliceGro.id },
            data: { color: "#65a30d" },
        });
        await seedSubcategory(alice.id, aliceGro.id, "Groceries");

        await seedExpense({
            userId: alice.id,
            categoryId: aliceGro.id,
            date: "2026-06-10T12:00:00Z",
            amount: 3200,
            actualExpenditure: 3200,
        });
        // Bob's override on his own groceries must not bleed into Alice's grid.
        await db.categoryBudget.create({
            data: {
                userId: bob.id,
                categoryId: aliceGro.id,
                month: "2026-06",
                amount: 1,
            },
        });

        const [row] = await repo.getCategoryBreakdown(alice.id, "2026-06");
        expect(row).toMatchObject({
            slug: "groceries",
            color: "#65a30d",
            monthlyBudget: 5000, // Alice's default, not Bob's override
            spent: 3200,
        });
    });

    it("getCategorySpends never surfaces another user's category metadata", async () => {
        const alice = await seedUser("alice@example.com");
        const bob = await seedUser("bob@example.com");
        const aliceCat = await seedCategory(alice.id, "housing", true);
        await seedCategory(bob.id, "housing", false);

        await seedExpense({
            userId: alice.id,
            categoryId: aliceCat.id,
            date: "2026-06-05T12:00:00Z",
            amount: 1000,
            actualExpenditure: 1000,
        });

        const rows = await repo.getCategorySpends(alice.id, "2026-06");
        expect(rows).toEqual([
            {
                slug: "housing",
                name: "housing",
                color: "#6b7280",
                isRelevant: true, // Alice's, not Bob's isRelevant:false copy
                spent: 1000,
            },
        ]);
    });
});

describe("a gf_fronted debt never reaches the dashboard (integration)", () => {
    // The debt is a Movement, never an Expense, so every dashboard figure must read
    // the same with one logged (ADR-0020).
    it("leaves every dashboard query byte-for-byte unchanged", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id, "groceries", true, 5000);
        const bbva = await db.card.create({
            data: {
                userId: user.id,
                name: "BBVA",
                color: "#2563eb",
                type: "credit",
            },
        });
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-05T12:00:00Z",
            amount: 1000,
            actualExpenditure: 680,
        });
        await db.expense.updateMany({
            where: { userId: user.id },
            data: { cardId: bbva.id },
        });

        const before = {
            categories: await repo.getCategorySpends(user.id, "2026-06"),
            cards: await repo.getCardSpends(user.id, "2026-06"),
            breakdown: await repo.getCategoryBreakdown(user.id, "2026-06"),
        };

        await db.movement.create({
            data: {
                userId: user.id,
                type: "gf_fronted",
                date: new Date("2026-06-06T12:00:00Z"),
                amount: 2500,
                note: "she covered the flights",
            },
        });

        expect({
            categories: await repo.getCategorySpends(user.id, "2026-06"),
            cards: await repo.getCardSpends(user.id, "2026-06"),
            breakdown: await repo.getCategoryBreakdown(user.id, "2026-06"),
        }).toEqual(before);
    });
});

describe("funding source at the data boundary (spec 0007 §2, criteria 4-6)", () => {
    async function seedMixedMonth() {
        const user = await seedUser();
        const shopping = await seedCategory(user.id, "shopping", false);
        const health = await seedCategory(user.id, "health", true);
        const card = await db.card.create({
            data: {
                userId: user.id,
                name: "NU",
                color: "#7c3aed",
                type: "credit",
            },
        });
        // One ordinary purchase, one from savings, one fully reimbursed — all
        // on the same card, in the same month.
        await seedExpense({
            userId: user.id,
            categoryId: shopping.id,
            date: "2026-06-05T12:00:00Z",
            amount: 500,
            actualExpenditure: 500,
            cardId: card.id,
        });
        await seedExpense({
            userId: user.id,
            categoryId: shopping.id,
            date: "2026-06-06T12:00:00Z",
            amount: 3000,
            actualExpenditure: 3000,
            cardId: card.id,
            fundedFrom: "savings",
        });
        await seedExpense({
            userId: user.id,
            categoryId: health.id,
            date: "2026-06-07T12:00:00Z",
            amount: 800,
            actualExpenditure: 800,
            cardId: card.id,
            fundedFrom: "reimbursed",
        });
        return { user, card };
    }

    it("keeps savings-funded and reimbursed rows out of the category spends", async () => {
        // The excluded rows never reach computeBuckets — the query drops them.
        const { user } = await seedMixedMonth();

        const rows = await repo.getCategorySpends(user.id, "2026-06");

        expect(rows).toHaveLength(1);
        expect(rows[0]?.slug).toBe("shopping");
        expect(rows[0]?.spent).toBe(500);
    });

    it("keeps them out of the category breakdown too", async () => {
        const { user } = await seedMixedMonth();

        const rows = await repo.getCategoryBreakdown(user.id, "2026-06");

        expect(rows.map((r) => r.slug)).toEqual(["shopping"]);
        expect(rows[0]?.spent).toBe(500);
    });

    it("still shows the FULL amount in spend-by-card (spec 0007 §3.2)", async () => {
        // The card saw every charge, whatever money settled it. A payment is
        // never source-tagged (ADR-0020 §6), so the card total is 500+3000+800.
        const { user, card } = await seedMixedMonth();

        const rows = await repo.getCardSpends(user.id, "2026-06");

        expect(rows).toHaveLength(1);
        expect(rows[0]?.id).toBe(card.id);
        expect(rows[0]?.spent).toBe(4300);
    });

    it("reports the excluded total for the dashboard's one-line summary", async () => {
        const { user } = await seedMixedMonth();

        expect(await repo.getNonIncomeFundedTotal(user.id, "2026-06")).toBe(
            3800,
        );
    });

    it("reports zero when this month's income funded everything", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id, "housing", true);
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-05T12:00:00Z",
            amount: 100,
            actualExpenditure: 100,
        });

        expect(await repo.getNonIncomeFundedTotal(user.id, "2026-06")).toBe(0);
    });

    it("defaults an untagged row to income, so existing data is unaffected", async () => {
        // The migration's default: every pre-existing row still counts.
        const user = await seedUser();
        const cat = await seedCategory(user.id, "housing", true);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-05T12:00:00Z",
            amount: 100,
            actualExpenditure: 100,
        });

        expect(row.fundedFrom).toBe("income");
        const rows = await repo.getCategorySpends(user.id, "2026-06");
        expect(rows[0]?.spent).toBe(100);
    });
});

describe("a partner-payment expense and spend-by-card (BUG-1, integration)", () => {
    /**
     * BUG-1: a row with no card surfaced as a phantom "Cash" segment, because
     * `getCardSpends` groups by `cardId` and reads null as cash. A partner payment has
     * the same shape, so the exclusion lives in this query.
     */
    it("shows no phantom Cash row for a partner payment", async () => {
        const user = await seedUser("bug1@example.com");
        const combined = await seedCategory(user.id, "combined-expenses", true);
        await seedExpense({
            userId: user.id,
            categoryId: combined.id,
            date: "2026-09-10T12:00:00Z",
            amount: 680,
            actualExpenditure: 680,
            isPartnerPayment: true,
        });

        const cards = await repo.getCardSpends(user.id, "2026-09");
        expect(cards).toEqual([]);
        expect(cards.find((c) => c.id === "cash")).toBeUndefined();
    });

    it("keeps real cash spend while excluding the payment row from the same month", async () => {
        const user = await seedUser("bug1-mixed@example.com");
        const combined = await seedCategory(user.id, "combined-expenses", true);
        const groceries = await seedCategory(user.id, "groceries", true);
        // A genuine cash purchase — also null `cardId`, so the exclusion has to
        // discriminate on the marker, not on the missing card.
        await seedExpense({
            userId: user.id,
            categoryId: groceries.id,
            date: "2026-09-05T12:00:00Z",
            amount: 200,
            actualExpenditure: 200,
        });
        await seedExpense({
            userId: user.id,
            categoryId: combined.id,
            date: "2026-09-10T12:00:00Z",
            amount: 680,
            actualExpenditure: 680,
            isPartnerPayment: true,
        });

        const cards = await repo.getCardSpends(user.id, "2026-09");
        expect(cards).toHaveLength(1);
        expect(cards[0]!.id).toBe("cash");
        // 200, not 880: the payment row never entered the grouping.
        expect(cards[0]!.spent).toBe(200);
    });

    it("still counts the payment row in the budget reads — that is the point", async () => {
        const user = await seedUser("bug1-budget@example.com");
        const combined = await seedCategory(user.id, "combined-expenses", true);
        await seedExpense({
            userId: user.id,
            categoryId: combined.id,
            date: "2026-09-10T12:00:00Z",
            amount: 680,
            actualExpenditure: 680,
            isPartnerPayment: true,
        });

        const spends = await repo.getCategorySpends(user.id, "2026-09");
        expect(spends).toHaveLength(1);
        expect(spends[0]!.spent).toBe(680);

        const breakdown = await repo.getCategoryBreakdown(user.id, "2026-09");
        expect(breakdown[0]!.spent).toBe(680);
    });
});

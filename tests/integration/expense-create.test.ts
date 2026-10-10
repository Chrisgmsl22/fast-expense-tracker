import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock only the session — the real DB is exercised. auth() is hoisted above the
// import rewrite; @/auth is mocked so next-auth/next-server never loads.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { db } from "@/lib/db";
import { createExpense } from "@/app/_actions/expense/create";

beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "" } }); // overridden per test
});

async function seedUserAndCategory() {
    const user = await db.user.create({
        data: { email: "me@example.com", password: "x", name: "Test" },
    });
    const category = await db.category.create({
        data: { userId: user.id, slug: "groceries", name: "Groceries" },
    });
    authMock.mockResolvedValue({ user: { id: user.id } });
    return { user, category };
}

function seedOtherUser() {
    return db.user.create({
        data: { email: "other@example.com", password: "x", name: "Other" },
    });
}

const validInput = (categoryId: string) => ({
    date: "2026-05-15",
    amount: 1000,
    categoryId,
    description: "Dinner",
    isShared: true,
    yourPercentage: 0.68,
    paidBy: "you" as const,
});

describe("createExpense (integration)", () => {
    it("rejects invalid input without writing a row", async () => {
        const { category } = await seedUserAndCategory();
        const res = await createExpense({
            ...validInput(category.id),
            amount: -5,
        });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("validation");
        expect(await db.expense.count()).toBe(0);
    });

    it("returns unauthenticated when there is no session", async () => {
        const { category } = await seedUserAndCategory();
        authMock.mockResolvedValue(null);

        const res = await createExpense(validInput(category.id));

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("unauthenticated");
        expect(await db.expense.count()).toBe(0);
    });

    it("stores the row with server-computed actualExpenditure", async () => {
        const { user, category } = await seedUserAndCategory();

        const res = await createExpense(validInput(category.id));

        expect(res.ok).toBe(true);
        if (!res.ok) throw new Error("expected success");
        const row = await db.expense.findUniqueOrThrow({
            where: { id: res.data.id },
        });
        expect(row.userId).toBe(user.id);
        expect(row.amount).toBe(1000);
        expect(row.actualExpenditure).toBe(680); // 1000 * 0.68, computed server-side
        expect(row.isShared).toBe(true);
    });

    it("rejects a subcategory that belongs to a different category", async () => {
        const { user, category } = await seedUserAndCategory();
        const otherCategory = await db.category.create({
            data: { userId: user.id, slug: "transport", name: "Transport" },
        });
        const sub = await db.subcategory.create({
            data: {
                userId: user.id,
                categoryId: otherCategory.id,
                name: "Gas",
            },
        });

        const res = await createExpense({
            ...validInput(category.id),
            subcategoryId: sub.id,
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("validation");
            expect(res.fieldErrors?.subcategoryId).toBeDefined();
        }
        expect(await db.expense.count()).toBe(0);
    });

    it("refuses another user's category on an income-funded expense, writing nothing", async () => {
        await seedUserAndCategory();
        const other = await seedOtherUser();
        const theirs = await db.category.create({
            data: { userId: other.id, slug: "hobbies", name: "Hobbies" },
        });

        const res = await createExpense({
            ...validInput(theirs.id),
            fundedFrom: "income",
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("validation");
            expect(res.fieldErrors?.categoryId).toBeDefined();
        }
        expect(await db.expense.count()).toBe(0);
    });

    it("refuses another user's subcategory even when it points at the chosen category", async () => {
        const { category } = await seedUserAndCategory();
        const other = await seedOtherUser();
        const theirs = await db.subcategory.create({
            data: { userId: other.id, categoryId: category.id, name: "Bakery" },
        });

        const res = await createExpense({
            ...validInput(category.id),
            subcategoryId: theirs.id,
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("validation");
            expect(res.fieldErrors?.subcategoryId).toBeDefined();
        }
        expect(await db.expense.count()).toBe(0);
    });

    it("refuses another user's card, writing nothing", async () => {
        const { category } = await seedUserAndCategory();
        const other = await seedOtherUser();
        const theirs = await db.card.create({
            data: {
                userId: other.id,
                name: "Their Visa",
                color: "#7c3aed",
                type: "credit",
            },
        });

        const res = await createExpense({
            ...validInput(category.id),
            cardId: theirs.id,
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("validation");
            expect(res.fieldErrors?.cardId).toBeDefined();
        }
        expect(await db.expense.count()).toBe(0);
    });

    it("stores the user's own card", async () => {
        const { user, category } = await seedUserAndCategory();
        const mine = await db.card.create({
            data: {
                userId: user.id,
                name: "My Visa",
                color: "#2563eb",
                type: "credit",
            },
        });

        const res = await createExpense({
            ...validInput(category.id),
            cardId: mine.id,
        });

        expect(res.ok).toBe(true);
        if (!res.ok) throw new Error("expected success");
        const row = await db.expense.findUniqueOrThrow({
            where: { id: res.data.id },
        });
        expect(row.cardId).toBe(mine.id);
    });
});

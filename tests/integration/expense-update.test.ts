import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock only the session — the real DB is exercised (mirrors expense-create.test.ts).
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { db } from "@/lib/db";
import { updateExpense } from "@/app/_actions/expense/update";

beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "" } });
});

async function seed() {
    const user = await db.user.create({
        data: { email: "me@example.com", password: "x", name: "Me" },
    });
    const other = await db.user.create({
        data: { email: "other@example.com", password: "x", name: "Other" },
    });
    const category = await db.category.create({
        data: { slug: "groceries", name: "Groceries" },
    });
    const category2 = await db.category.create({
        data: { slug: "transport", name: "Transport" },
    });
    authMock.mockResolvedValue({ user: { id: user.id } });
    return { user, other, category, category2 };
}

function makeExpense(userId: string, categoryId: string) {
    return db.expense.create({
        data: {
            userId,
            categoryId,
            date: new Date(Date.UTC(2026, 4, 15, 6)),
            description: "Old",
            amount: 100,
            isShared: false,
            yourPercentage: 1,
            actualExpenditure: 100,
            paidBy: "you",
        },
        select: { id: true },
    });
}

const editInput = (id: string, categoryId: string) => ({
    id,
    date: "2026-05-20",
    amount: 500,
    categoryId,
    description: "New dinner",
    isShared: true,
    yourPercentage: 0.68,
    paidBy: "you" as const,
});

describe("updateExpense (integration)", () => {
    it("updates the row and recomputes actualExpenditure server-side", async () => {
        const { user, category } = await seed();
        const { id } = await makeExpense(user.id, category.id);

        const res = await updateExpense(editInput(id, category.id));

        expect(res.ok).toBe(true);
        const row = await db.expense.findUniqueOrThrow({ where: { id } });
        expect(row.description).toBe("New dinner");
        expect(row.amount).toBe(500);
        expect(row.actualExpenditure).toBe(340); // 500 * 0.68, computed server-side
        expect(row.isShared).toBe(true);
    });

    it("does not edit another user's expense (ownership-scoped → not_found)", async () => {
        const { other, category } = await seed(); // session is `me`, row is `other`'s
        const { id } = await makeExpense(other.id, category.id);

        const res = await updateExpense(editInput(id, category.id));

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("not_found");
        const row = await db.expense.findUniqueOrThrow({ where: { id } });
        expect(row.description).toBe("Old"); // untouched
        expect(row.amount).toBe(100);
    });

    it("returns unauthenticated when there is no session", async () => {
        const { user, category } = await seed();
        const { id } = await makeExpense(user.id, category.id);
        authMock.mockResolvedValue(null);

        const res = await updateExpense(editInput(id, category.id));

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("unauthenticated");
    });

    it("rejects invalid input", async () => {
        const { user, category } = await seed();
        const { id } = await makeExpense(user.id, category.id);

        const res = await updateExpense({
            ...editInput(id, category.id),
            amount: -1,
        });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("validation");
    });

    it("rejects a subcategory that belongs to a different category", async () => {
        const { user, category, category2 } = await seed();
        const { id } = await makeExpense(user.id, category.id);
        const sub = await db.subcategory.create({
            data: { categoryId: category2.id, name: "Gas" },
        });

        const res = await updateExpense({
            ...editInput(id, category.id),
            subcategoryId: sub.id,
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("validation");
            expect(res.fieldErrors?.subcategoryId).toBeDefined();
        }
    });

    it("returns not_found for a missing id", async () => {
        const { category } = await seed();

        const res = await updateExpense(
            editInput("00000000-0000-0000-0000-000000000000", category.id),
        );

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("not_found");
    });

    it("returns db_error when the write throws", async () => {
        const { user, category } = await seed();
        const { id } = await makeExpense(user.id, category.id);
        const spy = vi
            .spyOn(db.expense, "updateMany")
            .mockRejectedValueOnce(new Error("boom"));

        const res = await updateExpense(editInput(id, category.id));

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("db_error");
        spy.mockRestore();
    });
});

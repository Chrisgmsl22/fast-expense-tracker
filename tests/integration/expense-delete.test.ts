import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock only the session — the real DB is exercised (mirrors expense-create.test.ts).
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { db } from "@/lib/db";
import { deleteExpense } from "@/app/_actions/expense/delete";

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
    authMock.mockResolvedValue({ user: { id: user.id } });
    return { user, other, category };
}

function makeExpense(userId: string, categoryId: string) {
    return db.expense.create({
        data: {
            userId,
            categoryId,
            date: new Date(Date.UTC(2026, 4, 15, 6)),
            description: "Lunch",
            amount: 100,
            isShared: false,
            yourPercentage: 1,
            actualExpenditure: 100,
            paidBy: "you",
        },
        select: { id: true },
    });
}

describe("deleteExpense (integration)", () => {
    it("deletes the signed-in user's own expense", async () => {
        const { user, category } = await seed();
        const { id } = await makeExpense(user.id, category.id);

        const res = await deleteExpense({ id });

        expect(res.ok).toBe(true);
        expect(await db.expense.count({ where: { id } })).toBe(0);
    });

    it("does not delete another user's expense (ownership-scoped → not_found)", async () => {
        const { other, category } = await seed(); // session is `me`, row is `other`'s
        const { id } = await makeExpense(other.id, category.id);

        const res = await deleteExpense({ id });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("not_found");
        expect(await db.expense.count({ where: { id } })).toBe(1); // still there
    });

    it("returns unauthenticated when there is no session", async () => {
        const { user, category } = await seed();
        const { id } = await makeExpense(user.id, category.id);
        authMock.mockResolvedValue(null);

        const res = await deleteExpense({ id });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("unauthenticated");
        expect(await db.expense.count({ where: { id } })).toBe(1);
    });

    it("returns validation when no id is given", async () => {
        await seed();
        const res = await deleteExpense({});
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("validation");
    });

    it("returns not_found for a missing id", async () => {
        await seed();
        const res = await deleteExpense({
            id: "00000000-0000-0000-0000-000000000000",
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("not_found");
    });

    it("returns db_error when the delete throws", async () => {
        const { user, category } = await seed();
        const { id } = await makeExpense(user.id, category.id);
        const spy = vi
            .spyOn(db.expense, "deleteMany")
            .mockRejectedValueOnce(new Error("boom"));

        const res = await deleteExpense({ id });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("db_error");
        spy.mockRestore();
    });
});

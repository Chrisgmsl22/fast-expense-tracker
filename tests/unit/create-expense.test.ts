import { beforeEach, describe, expect, it, vi } from "vitest";

// `createExpense` calls `auth()`; mock it so these stay pure unit tests. The
// repository is injected (the fake), so there's no database in play at all.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { createExpense } from "@/app/_actions/expense/create";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";

function validInput(over: Record<string, unknown> = {}) {
    return {
        date: "2026-05-10",
        amount: 1000,
        categoryId: "cat1",
        description: "lunch",
        isShared: false,
        yourPercentage: 1,
        paidBy: "you",
        ...over,
    };
}

describe("createExpense (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("rejects invalid input with a validation code + field errors", async () => {
        const repo = new FakeExpenseRepository();
        const res = await createExpense({ amount: -5 }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors).toBeDefined();
        expect(repo.inserts).toHaveLength(0);
    });

    it("returns unauthenticated when there is no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeExpenseRepository();

        const res = await createExpense(validInput(), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.inserts).toHaveLength(0);
    });

    it("persists and returns the new id on the happy path", async () => {
        const repo = new FakeExpenseRepository();

        const res = await createExpense(validInput(), repo);

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.data.id).toMatch(/^exp_/);
        expect(repo.inserts[0]?.userId).toBe("u1");
    });

    it("computes the shared split before persisting", async () => {
        const repo = new FakeExpenseRepository();

        const res = await createExpense(
            validInput({ isShared: true, yourPercentage: 0.68, amount: 1000 }),
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.inserts[0]?.actualExpenditure).toBe(680);
    });

    it("rejects a subcategory that doesn't belong to the chosen category", async () => {
        const repo = new FakeExpenseRepository();
        repo.setSubcategory("sub1", "a-different-category");

        const res = await createExpense(
            validInput({ subcategoryId: "sub1", categoryId: "cat1" }),
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.subcategoryId).toBeDefined();
        expect(repo.inserts).toHaveLength(0);
    });

    it("maps a repository write failure to db_error", async () => {
        const repo = new FakeExpenseRepository();
        repo.failOnWrite = true;

        const res = await createExpense(validInput(), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});

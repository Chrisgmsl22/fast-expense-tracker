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
    describe("funding source (spec 0007 §3.1/§3.3)", () => {
        it("defaults to income, so ignoring the control changes nothing", async () => {
            const repo = new FakeExpenseRepository();

            await createExpense(validInput(), repo);

            expect(repo.inserts[0]?.fundedFrom).toBe("income");
        });

        it("persists a savings-funded purchase at its full amount", async () => {
            // Spec 0007 §3.2: the tag goes on the purchase, and the amount is
            // untouched — the card still sees the whole charge.
            const repo = new FakeExpenseRepository();
            repo.setCategorySlug("cat1", "shopping");

            const res = await createExpense(
                validInput({ fundedFrom: "savings", amount: 3000 }),
                repo,
            );

            expect(res.ok).toBe(true);
            expect(repo.inserts[0]?.fundedFrom).toBe("savings");
            expect(repo.inserts[0]?.amount).toBe(3000);
            expect(repo.inserts[0]?.actualExpenditure).toBe(3000);
        });

        it("allows reimbursed on a health expense", async () => {
            const repo = new FakeExpenseRepository();
            repo.setCategorySlug("cat1", "health");

            const res = await createExpense(
                validInput({ fundedFrom: "reimbursed" }),
                repo,
            );

            expect(res.ok).toBe(true);
            expect(repo.inserts[0]?.fundedFrom).toBe("reimbursed");
        });

        it("rejects reimbursed on a non-health expense, writing nothing", async () => {
            const repo = new FakeExpenseRepository();
            repo.setCategorySlug("cat1", "shopping");

            const res = await createExpense(
                validInput({ fundedFrom: "reimbursed" }),
                repo,
            );

            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("validation");
            expect(res.fieldErrors?.fundedFrom?.[0]).toContain("health");
            expect(repo.inserts).toHaveLength(0);
        });

        it("ignores a client-supplied slug — the category is resolved server-side", async () => {
            const repo = new FakeExpenseRepository();
            repo.setCategorySlug("cat1", "shopping");

            const res = await createExpense(
                validInput({
                    fundedFrom: "reimbursed",
                    categorySlug: "health",
                }),
                repo,
            );

            expect(res.ok).toBe(false);
            expect(repo.inserts).toHaveLength(0);
        });
    });
});

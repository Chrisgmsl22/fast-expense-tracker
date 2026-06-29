import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { updateExpense } from "@/app/_actions/expense/update";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";

function validInput(over: Record<string, unknown> = {}) {
    return {
        id: "e1",
        date: "2026-05-10",
        amount: 1000,
        categoryId: "cat1",
        description: "updated lunch",
        isShared: false,
        yourPercentage: 1,
        paidBy: "you",
        ...over,
    };
}

describe("updateExpense (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("rejects invalid expense fields with a validation code", async () => {
        const repo = new FakeExpenseRepository();
        const res = await updateExpense(validInput({ amount: -5 }), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
    });

    it("rejects a missing id with a validation code", async () => {
        const repo = new FakeExpenseRepository();
        const res = await updateExpense(validInput({ id: undefined }), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
    });

    it("returns unauthenticated when there is no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeExpenseRepository();

        const res = await updateExpense(validInput(), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
    });

    it("returns not_found when the row doesn't exist", async () => {
        const repo = new FakeExpenseRepository();

        const res = await updateExpense(validInput(), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("returns not_found when the row belongs to another user (IDOR guard)", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e1", "someone-else");

        const res = await updateExpense(validInput(), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("updates the owner's row and returns its id", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e1", "u1");

        const res = await updateExpense(validInput(), repo);

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.data.id).toBe("e1");
    });

    it("rejects a subcategory that doesn't belong to the chosen category", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e1", "u1");
        repo.setSubcategory("sub1", "a-different-category");

        const res = await updateExpense(
            validInput({ subcategoryId: "sub1", categoryId: "cat1" }),
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.subcategoryId).toBeDefined();
    });

    it("maps a repository write failure to db_error", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e1", "u1");
        repo.failOnWrite = true;

        const res = await updateExpense(validInput(), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});

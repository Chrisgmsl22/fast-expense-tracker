// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks must be hoisted above the imports vi.mock rewrites.
const { authMock, createMock } = vi.hoisted(() => ({
    authMock: vi.fn(),
    createMock: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { expense: { create: createMock } } }));

import { createExpense } from "@/app/_actions/expense/create";

const base = {
    date: "2026-06-15",
    amount: 1000,
    categoryId: "cat-1",
    description: "Groceries",
};

beforeEach(() => {
    authMock.mockReset();
    createMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    createMock.mockResolvedValue({ id: "exp-1" });
});

describe("createExpense", () => {
    it("creates a non-shared expense with actualExpenditure = amount", async () => {
        const res = await createExpense(base);
        expect(res).toEqual({ ok: true, id: "exp-1" });
        const data = createMock.mock.calls[0]![0].data;
        expect(data.actualExpenditure).toBe(1000);
        expect(data.paidBy).toBe("you");
        expect(data.userId).toBe("user-1");
    });

    it("computes actualExpenditure = amount * yourPercentage for a shared expense", async () => {
        const res = await createExpense({
            ...base,
            isShared: true,
            yourPercentage: 0.7,
            paidBy: "gf",
        });
        expect(res.ok).toBe(true);
        const data = createMock.mock.calls[0]![0].data;
        expect(data.actualExpenditure).toBeCloseTo(700);
        expect(data.paidBy).toBe("gf");
    });

    it("stores the date as CDMX-local-midnight in UTC (06:00Z)", async () => {
        await createExpense(base);
        const data = createMock.mock.calls[0]![0].data;
        expect((data.date as Date).toISOString()).toBe(
            "2026-06-15T06:00:00.000Z",
        );
    });

    it("rejects invalid input without touching the DB", async () => {
        const res = await createExpense({ ...base, amount: -5 });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.fieldErrors?.amount).toBeDefined();
        expect(createMock).not.toHaveBeenCalled();
    });

    it("refuses when there is no authenticated user", async () => {
        authMock.mockResolvedValue(null);
        const res = await createExpense(base);
        expect(res).toEqual({ ok: false, error: "Not authenticated" });
        expect(createMock).not.toHaveBeenCalled();
    });
});

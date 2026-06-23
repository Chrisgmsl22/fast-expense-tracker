// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));
vi.mock("@/lib/db", () => ({
    db: { expense: { findMany: findManyMock } },
}));

import { getExpensesForMonth } from "@/lib/services/expense/expense.service";

beforeEach(() => {
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);
});

describe("getExpensesForMonth", () => {
    it("queries the CDMX month range, scoped to the user, newest first", async () => {
        await getExpensesForMonth("user-1", "2026-05");

        const arg = findManyMock.mock.calls[0]![0];
        expect(arg.where.userId).toBe("user-1");
        expect(arg.where.date.gte.toISOString()).toBe(
            "2026-05-01T06:00:00.000Z",
        );
        expect(arg.where.date.lt.toISOString()).toBe(
            "2026-06-01T06:00:00.000Z",
        );
        expect(arg.orderBy).toEqual({ date: "desc" });
    });

    it("returns the rows the DB returns", async () => {
        findManyMock.mockResolvedValue([{ id: "e1" }]);
        const res = await getExpensesForMonth("user-1", "2026-05");
        expect(res).toEqual([{ id: "e1" }]);
    });
});

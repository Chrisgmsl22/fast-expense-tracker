import { beforeEach, describe, expect, it, vi } from "vitest";

// `addVariableIncome` calls `auth()`; mock it so these stay pure unit tests. The
// repository is injected (the fake), so there's no database in play.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { addVariableIncome } from "@/app/_actions/income/add-variable";
import { FakeIncomeRepository } from "@/tests/support/fake-income-repository";

function validInput(over: Record<string, unknown> = {}) {
    return {
        source: "Freelance — logo",
        amount: 3000,
        date: "2026-06-10",
        ...over,
    };
}

describe("addVariableIncome (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("rejects invalid input with a validation code + field errors", async () => {
        const repo = new FakeIncomeRepository();
        const res = await addVariableIncome({ amount: -5 }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors).toBeDefined();
        expect(repo.inserts).toHaveLength(0);
    });

    it("returns unauthenticated when there is no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeIncomeRepository();

        const res = await addVariableIncome(validInput(), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.inserts).toHaveLength(0);
    });

    it("persists with the CDMX-06:00Z date and returns the new id", async () => {
        const repo = new FakeIncomeRepository();

        const res = await addVariableIncome(validInput(), repo);

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.data.id).toMatch(/^inc_/);
        const row = repo.inserts[0]!;
        expect(row.userId).toBe("u1");
        expect(row.source).toBe("Freelance — logo");
        expect(row.amount).toBe(3000);
        // Stored as that calendar day's CDMX local midnight (06:00Z).
        expect(row.date.toISOString()).toBe("2026-06-10T06:00:00.000Z");
    });

    it("maps a repository write failure to db_error", async () => {
        const repo = new FakeIncomeRepository();
        repo.failOnWrite = true;

        const res = await addVariableIncome(validInput(), repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});

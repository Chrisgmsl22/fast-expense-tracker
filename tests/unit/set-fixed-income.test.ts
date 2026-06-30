import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { setFixedIncome } from "@/app/_actions/income/set-fixed";
import { FakeIncomeRepository } from "@/tests/support/fake-income-repository";

describe("setFixedIncome (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("rejects a negative amount with a validation code + field errors", async () => {
        const repo = new FakeIncomeRepository();
        const res = await setFixedIncome({ amount: -1 }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.amount).toBeDefined();
        expect(repo.fixedWrites).toHaveLength(0);
    });

    it("returns unauthenticated when there is no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome({ amount: 44000 }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.fixedWrites).toHaveLength(0);
    });

    it("upserts the fixed amount for the signed-in user", async () => {
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome({ amount: 44000 }, repo);

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.data.amount).toBe(44000);
        expect(repo.fixedWrites).toEqual([{ userId: "u1", amount: 44000 }]);
    });

    it("allows 0 to clear the fixed amount", async () => {
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome({ amount: 0 }, repo);

        expect(res.ok).toBe(true);
        expect(repo.fixedWrites).toEqual([{ userId: "u1", amount: 0 }]);
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeIncomeRepository();
        repo.failOnWrite = true;

        const res = await setFixedIncome({ amount: 44000 }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { addPartnerDebt } from "@/app/_actions/movement/add-partner-debt";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";

describe("addPartnerDebt (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("stores an Expense{paidBy:'gf'} with actualExpenditure = amount, unshared", async () => {
        const repo = new FakeExpenseRepository();
        const res = await addPartnerDebt(
            {
                date: "2026-07-10",
                amount: "500",
                categoryId: "cat_groceries",
                note: "groceries she covered",
            },
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.inserts).toHaveLength(1);
        const row = repo.inserts[0]!;
        expect(row.paidBy).toBe("gf");
        expect(row.amount).toBe(500);
        expect(row.actualExpenditure).toBe(500); // all of it is your cost
        expect(row.isShared).toBe(false);
        expect(row.categoryId).toBe("cat_groceries");
        expect(row.description).toBe("groceries she covered");
    });

    it("defaults the description to 'I owe Brenda' when no note is given", async () => {
        const repo = new FakeExpenseRepository();
        await addPartnerDebt(
            { date: "2026-07-10", amount: "300", categoryId: "cat_1" },
            repo,
        );
        expect(repo.inserts[0]!.description).toBe("I owe Brenda");
    });

    it("rejects an invalid debt with a validation code + no write", async () => {
        const repo = new FakeExpenseRepository();
        const res = await addPartnerDebt(
            { date: "2026-07-10", amount: "0", categoryId: "" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(repo.inserts).toHaveLength(0);
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeExpenseRepository();
        const res = await addPartnerDebt(
            { date: "2026-07-10", amount: "500", categoryId: "cat_1" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.inserts).toHaveLength(0);
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeExpenseRepository();
        repo.failOnWrite = true;
        const res = await addPartnerDebt(
            { date: "2026-07-10", amount: "500", categoryId: "cat_1" },
            repo,
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});

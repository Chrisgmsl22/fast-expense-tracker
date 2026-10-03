import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { deleteExpense } from "@/app/_actions/expense/delete";
import { getExpenseForEdit } from "@/app/_actions/expense/get-for-edit";
import { updateExpense } from "@/app/_actions/expense/update";
import type { ExpenseInsertData } from "@/lib/repositories/expense.repository";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";

const CLOSED = new Date("2026-06-30T12:00:00Z");

type Seed = Partial<ExpenseInsertData & { cycleClosedAt: Date | null }>;

const SHARED: Seed = { amount: 1000, actualExpenditure: 680, isShared: true };
const SOLO: Seed = { amount: 1000, actualExpenditure: 1000 };
const PAYMENT: Seed = {
    amount: 530,
    actualExpenditure: 530,
    isPartnerPayment: true,
};

function repoWith(over: Seed) {
    const repo = new FakeExpenseRepository();
    // The update arm resolves the category; u1 owns it, so only the cycle can refuse.
    repo.setCategorySlug("cat1", "groceries", "u1");
    repo.seedExpense("e1", "u1", over);
    return repo;
}

describe("getExpenseForEdit (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("prefills a shared row whose cycle is still open", async () => {
        const res = await getExpenseForEdit("e1", repoWith(SHARED));

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.data).toEqual(
            expect.objectContaining({
                id: "e1",
                amount: 1000,
                actualExpenditure: 680,
                cycleClosedAt: null,
            }),
        );
    });

    it("refuses a shared row a closed cycle counted", async () => {
        const res = await getExpenseForEdit(
            "e1",
            repoWith({ ...SHARED, cycleClosedAt: CLOSED }),
        );

        expect(res).toEqual({
            ok: false,
            code: "cycle_closed",
            message:
                "Your partner's share of this expense counts in a settlement you already closed, so it can't be edited.",
        });
    });

    it("refuses a payment to the partner a closed cycle counted, naming it a payment", async () => {
        const res = await getExpenseForEdit(
            "e1",
            repoWith({ ...PAYMENT, cycleClosedAt: CLOSED }),
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        expect(res.message).toMatch(/^This payment counts/);
    });

    it("prefills a solo row of the same age, which no cycle counted", async () => {
        const res = await getExpenseForEdit(
            "e1",
            repoWith({ ...SOLO, cycleClosedAt: CLOSED }),
        );

        expect(res.ok).toBe(true);
    });

    it("returns not_found when the row isn't the user's (IDOR guard)", async () => {
        authMock.mockResolvedValue({ user: { id: "someone_else" } });
        const res = await getExpenseForEdit("e1", repoWith(SHARED));

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("returns not_found for an empty id without reading", async () => {
        const repo = repoWith(SHARED);
        const getById = vi.spyOn(repo, "getById");

        const res = await getExpenseForEdit("", repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
        expect(getById).not.toHaveBeenCalled();
    });

    it("returns unauthenticated with no session", async () => {
        authMock.mockResolvedValue(null);
        const res = await getExpenseForEdit("e1", repoWith(SHARED));

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
    });

    it("maps a repository failure to db_error", async () => {
        const repo = repoWith(SHARED);
        vi.spyOn(repo, "getById").mockRejectedValue(new Error("fake: down"));

        const res = await getExpenseForEdit("e1", repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});

describe("the edit read refuses exactly the rows the writes refuse", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    const unchangedEdit = (seed: Seed) => ({
        id: "e1",
        date: "2026-06-10",
        amount: seed.amount,
        categoryId: "cat1",
        description: "seed",
        isShared: seed.isShared ?? false,
        yourPercentage: seed.isShared ? 0.68 : 1,
        paidBy: "you",
    });

    const SHARE_REFUSAL =
        "Your partner's share of this expense counts in a settlement you already closed, so it can't";
    const PAYMENT_REFUSAL =
        "This payment counts in a settlement you already closed, so it can't";
    const messageOf = (res: { ok: boolean; message?: string }) =>
        res.ok ? null : res.message;

    it.each([
        ["shared, open", SHARED, null, null],
        ["shared, closed", SHARED, CLOSED, SHARE_REFUSAL],
        ["solo, open", SOLO, null, null],
        ["solo, closed", SOLO, CLOSED, null],
        ["payment, open", PAYMENT, null, null],
        ["payment, closed", PAYMENT, CLOSED, PAYMENT_REFUSAL],
    ] as const)("%s", async (_label, seed, cycleClosedAt, refusal) => {
        const isCycleClosed = (res: { ok: boolean; code?: string }) =>
            !res.ok && res.code === "cycle_closed";

        const read = await getExpenseForEdit(
            "e1",
            repoWith({ ...seed, cycleClosedAt }),
        );
        const update = await updateExpense(
            unchangedEdit(seed),
            repoWith({ ...seed, cycleClosedAt }),
        );
        const remove = await deleteExpense(
            { id: "e1" },
            repoWith({ ...seed, cycleClosedAt }),
        );

        // Pinned, so the three cannot agree by all being wrong.
        const frozen = cycleClosedAt !== null && seed !== SOLO;
        expect(isCycleClosed(read)).toBe(frozen);
        expect(isCycleClosed(read)).toBe(isCycleClosed(update));
        expect(isCycleClosed(read)).toBe(isCycleClosed(remove));
        // The same words on every path: the read says what the save would say.
        if (refusal) {
            expect(messageOf(read)).toBe(`${refusal} be edited.`);
            expect(messageOf(update)).toBe(messageOf(read));
            expect(messageOf(remove)).toBe(`${refusal} be deleted.`);
        }
        // Every unfrozen row really saves, so "not refused" is not a validation miss.
        if (!frozen) {
            expect(read.ok).toBe(true);
            expect(update.ok).toBe(true);
            expect(remove.ok).toBe(true);
        }
    });
});

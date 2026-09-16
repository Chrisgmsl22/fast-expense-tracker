// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { deleteExpense } from "@/app/_actions/expense/delete";
import { updateExpense } from "@/app/_actions/expense/update";
import { updatePartnerPayment } from "@/app/_actions/expense/update-partner-payment";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";

/**
 * A closed settlement is a filed record, and the close dialog says so: "Closed
 * settlements cannot be reopened."
 *
 * The movement side has always honoured that — `deleteForUser` and
 * `updateForUser` carry `closedAt: null` in their where-clause and the actions
 * answer `cycle_closed`. The EXPENSE side did not, so deleting an old shared
 * expense from the Expenses screen silently restated a settlement the user had
 * filed: her share of it vanished from a cycle that was supposed to be frozen,
 * and nothing on screen said a thing.
 *
 * An expense carries no marker column — cycle membership is its `createdAt`
 * against the sequence of close instants — so the repository resolves the fact
 * once, onto `ExpenseEditable.cycleClosedAt`, and every write path reads it.
 *
 * **The marker alone is not the rule.** A cycle counts a partner share and a
 * payment to her, and nothing else, so those are the only rows it may freeze.
 * The first version of this guard refused on the marker alone and locked the
 * whole expense history — every solo lunch entered before the first close — with
 * a message that told the user it was part of a settlement it was never in.
 */
const CLOSED_AT = new Date("2026-09-12T18:00:00Z");

const soloPayload = {
    id: "e1",
    date: "2026-09-10",
    amount: 900,
    categoryId: "cat1",
    description: "Soriana",
    isShared: false,
    paidBy: "you",
};

/** Turning the same row into a shared one — a partner share, newly created. */
const sharedPayload = {
    ...soloPayload,
    isShared: true,
    yourPercentage: 0.68,
};

type Row = "solo" | "shared" | "payment";

/** `shared` carries a partner share (1000 − 680); `solo` carries none. */
function repoWith(kind: Row, cycleClosedAt: Date | null) {
    const repo = new FakeExpenseRepository();
    repo.seedExpense("e1", "u1", {
        categoryId: "cat1",
        amount: kind === "shared" ? 1000 : 800,
        actualExpenditure: kind === "shared" ? 680 : 800,
        isShared: kind === "shared",
        yourPercentage: kind === "shared" ? 0.68 : 1,
        isPartnerPayment: kind === "payment",
        cycleClosedAt,
    });
    return repo;
}

function paymentDeps(cycleClosedAt: Date | null) {
    const expenseRepo = repoWith("payment", cycleClosedAt);
    const settingsRepo = new FakeSettingsRepository();
    settingsRepo.seed("u1", { sharesExpenses: true, partnerName: "Brenda" });
    return { expenseRepo, settingsRepo };
}

beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "u1" } });
});

describe("a row the closed cycle COUNTED is frozen", () => {
    it("refuses to delete a shared expense, and says why", async () => {
        const repo = repoWith("shared", CLOSED_AT);

        const res = await deleteExpense({ id: "e1" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        // The same code the movement side already returns, so a caller handles
        // one case, not two.
        expect(res.code).toBe("cycle_closed");
        // The message must be TRUE of the row it fires on: this one is frozen
        // because the partner's share of it is inside a filed settlement.
        expect(res.message).toMatch(/partner's share/i);
        expect(res.message).toMatch(/already closed/i);
        expect(repo.deletes).toHaveLength(0);
    });

    it("refuses to edit a shared expense, and writes nothing", async () => {
        const repo = repoWith("shared", CLOSED_AT);

        const res = await updateExpense({ ...sharedPayload }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        expect(repo.updates).toHaveLength(0);
    });

    it("refuses to delete a payment — that row is usually the one that squared the cycle", async () => {
        const repo = repoWith("payment", CLOSED_AT);

        const res = await deleteExpense({ id: "e1" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        // A payment-expense never carries the marker — only a movement does —
        // so the message says the cycle COUNTED it, not that it closed one.
        expect(res.message).toMatch(/payment counts in a settlement/i);
        expect(repo.deletes).toHaveLength(0);
    });

    it("names the FREEZE, not the split rule, when a frozen payment is edited as shared", async () => {
        // Both refusals apply to this payload. The split rule is the one the
        // user could satisfy — and satisfying it still gets a refusal, because
        // the row is frozen. So the frozen reason has to come first, or the user
        // acts on the wrong one.
        const repo = repoWith("payment", CLOSED_AT);

        const res = await updateExpense({ ...sharedPayload }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        expect(res.message).toMatch(/payment counts in a settlement/i);
        expect(res.message).not.toMatch(/whole transfer/i);
        expect(repo.updates).toHaveLength(0);
    });

    it("refuses the payment edit too", async () => {
        const deps = paymentDeps(CLOSED_AT);

        const res = await updatePartnerPayment(
            { id: "e1", date: "2026-09-10", amount: 900 },
            deps,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        expect(deps.expenseRepo.updates).toHaveLength(0);
    });
});

describe("a SOLO row inside a closed cycle is not frozen", () => {
    // This is the regression the first guard shipped: a close today froze every
    // expense ever entered, because every one of them predates it.

    it("still deletes", async () => {
        const repo = repoWith("solo", CLOSED_AT);

        const res = await deleteExpense({ id: "e1" }, repo);

        expect(res.ok).toBe(true);
        expect(repo.deletes).toHaveLength(1);
    });

    it("still edits", async () => {
        const repo = repoWith("solo", CLOSED_AT);

        const res = await updateExpense({ ...soloPayload }, repo);

        expect(res.ok).toBe(true);
        expect(repo.updates).toHaveLength(1);
    });

    it("refuses an edit that would SPLIT it — that adds a share to a filed cycle", async () => {
        const repo = repoWith("solo", CLOSED_AT);

        const res = await updateExpense({ ...sharedPayload }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        expect(res.message).toMatch(/can't be split/i);
        expect(res.fieldErrors?.isShared?.[0]).toMatch(/already closed/i);
        expect(repo.updates).toHaveLength(0);
    });
});

describe("a row in the OPEN cycle stays editable", () => {
    it("deletes a shared expense", async () => {
        const repo = repoWith("shared", null);

        const res = await deleteExpense({ id: "e1" }, repo);

        expect(res.ok).toBe(true);
        expect(repo.deletes).toHaveLength(1);
    });

    it("edits a shared expense", async () => {
        const repo = repoWith("shared", null);

        const res = await updateExpense({ ...sharedPayload }, repo);

        expect(res.ok).toBe(true);
        expect(repo.updates).toHaveLength(1);
    });

    it("splits a solo expense", async () => {
        const repo = repoWith("solo", null);

        const res = await updateExpense({ ...sharedPayload }, repo);

        expect(res.ok).toBe(true);
        expect(repo.updates).toHaveLength(1);
    });

    it("still reports a missing row as not-found, not as frozen", async () => {
        const repo = repoWith("shared", null);

        const res = await deleteExpense({ id: "nope" }, repo);

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("not_found");
    });
});

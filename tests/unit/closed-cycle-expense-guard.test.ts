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
 * A closed settlement is a filed record, and the close dialog says so. `cycleClosedAt`
 * is resolved by the repository from every close instant, not read off the row, and
 * every write path pairs it with `movesSettlementBalance` — a marker alone is not the
 * rule.
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
        // The message names the freeze the row always has — being counted — which
        // holds whether or not this payment is also the row carrying the marker.
        expect(res.message).toMatch(/payment counts in a settlement/i);
        expect(repo.deletes).toHaveLength(0);
    });

    it("names the FREEZE, not the split rule, when a frozen payment is edited as shared", async () => {
        // Both refusals apply. The frozen reason must come first, or the user acts on
        // the split rule — the one they can satisfy and still be refused.
        const repo = repoWith("payment", CLOSED_AT);

        const res = await updateExpense({ ...sharedPayload }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        expect(res.message).toMatch(/payment counts in a settlement/i);
        expect(res.message).not.toMatch(/whole transfer/i);
        expect(repo.updates).toHaveLength(0);
    });

    it("names the FREEZE, not the category rule, when a frozen payment's category is changed", async () => {
        // The category-lock guard runs AFTER the closed-cycle check, so a
        // frozen payment must not be told a rule it happens to also break.
        const repo = repoWith("payment", CLOSED_AT);

        const res = await updateExpense(
            { ...soloPayload, categoryId: "cat2" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("cycle_closed");
        expect(res.message).toMatch(/payment counts in a settlement/i);
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
    // Freezing on the marker alone would refuse every expense entered before the close.

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

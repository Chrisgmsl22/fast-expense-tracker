import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { updateExpense } from "@/app/_actions/expense/update";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import type { SettlementExpenseRow } from "@/lib/repositories/settlement.repository";
import { FakeExpenseRepository } from "@/tests/support/fake-expense-repository";
import { FakeSettlementRepository } from "@/tests/support/fake-settlement-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";

/**
 * The ordinary expense form must not be able to shrink a debt.
 *
 * A fronted row is an ordinary `Expense` once saved, so it opens in the ordinary
 * edit form — which offers the shared-expense split. The amount on a fronted row
 * is ALREADY his share (spec 0007 §6a decision 1), so applying a 68% split to it
 * would store `actualExpenditure` 462.40 on a $680 debt. The settlement balance
 * reads that exact field as what he owes, so the debt would quietly drop by a
 * third with nothing on screen saying so. `updateExpense` clamps it.
 */
const DEBT = 680;
const DAY = new Date("2026-09-10T06:00:00Z");
const NOW = new Date("2026-09-15T12:00:00Z");

/** The attack: open the debt, tick "shared" at the usual 68%, save. */
const splitAttack = {
    id: "debt1",
    date: "2026-09-10",
    amount: DEBT,
    categoryId: "combined",
    description: "I owe Brenda",
    isShared: true,
    yourPercentage: 0.68,
    paidBy: "you",
};

function seededRepo() {
    const repo = new FakeExpenseRepository();
    repo.seedExpense("debt1", "u1", {
        isFronted: true,
        categoryId: "combined",
        amount: DEBT,
        actualExpenditure: DEBT,
        description: "I owe Brenda",
        date: DAY,
    });
    return repo;
}

/** The balance, computed from whatever the edit actually persisted. */
function settlementFrom(row: SettlementExpenseRow) {
    const settlementRepo = new FakeSettlementRepository();
    settlementRepo.setExpenses([row]);
    const settingsRepo = new FakeSettingsRepository();
    settingsRepo.seed("u1", { sharesExpenses: true, partnerName: "Brenda" });
    return getSettlement("u1", { settlementRepo, settingsRepo, now: NOW });
}

describe("editing a fronted debt through the ordinary expense form", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("refuses the split outright — no write, and the balance does not move", async () => {
        const repo = seededRepo();
        const res = await updateExpense(splitAttack, repo);

        // Refused, not quietly coerced. A "saved" answer to a change that was
        // ignored is the silent save failure this repo shipped once already.
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.message).toMatch(/already your share/i);
        expect(res.fieldErrors?.yourPercentage).toBeDefined();
        expect(repo.updates).toHaveLength(0);

        // The stored row is untouched, so the balance still reads the full debt.
        const settlement = await settlementFrom({
            id: "debt1",
            date: DAY,
            description: "I owe Brenda",
            amount: DEBT,
            actualExpenditure: DEBT,
            isShared: false,
            isFronted: true,
            createdAt: DAY,
        });
        expect(settlement.balance.direction).toBe("you_owe");
        expect(settlement.balance.amount).toBe(DEBT);
        expect(settlement.breakdownItems.your_debt[0]!.amount).toBe(DEBT);
        expect(settlement.breakdownItems.partner_share).toHaveLength(0);
    });

    it("refuses a card, rather than saving and dropping it in silence", async () => {
        const repo = seededRepo();
        const res = await updateExpense(
            { ...splitAttack, isShared: false, cardId: "card1" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.fieldErrors?.cardId).toBeDefined();
        expect(repo.updates).toHaveLength(0);
    });

    it("clamps the money on a payload that carries a stray split percentage", async () => {
        const repo = seededRepo();
        // `isShared` false, so nothing is being asked for — but the form sends
        // the configured percentage along regardless. It must not reach the row.
        const res = await updateExpense(
            { ...splitAttack, isShared: false, yourPercentage: 0.68 },
            repo,
        );

        expect(res.ok).toBe(true);
        const saved = repo.updates[0]!.data;
        expect(saved.actualExpenditure).toBe(DEBT);
        expect(saved.yourPercentage).toBe(1);
        expect(saved.isShared).toBe(false);
    });

    it("tracks a genuine amount change on both money columns", async () => {
        const repo = seededRepo();
        await updateExpense(
            { ...splitAttack, isShared: false, amount: 900 },
            repo,
        );

        const saved = repo.updates[0]!.data;
        // Correcting what he owes is legitimate; splitting it is not.
        expect(saved.amount).toBe(900);
        expect(saved.actualExpenditure).toBe(900);
    });

    it("still applies a split to an ordinary expense", async () => {
        const repo = new FakeExpenseRepository();
        repo.seedExpense("e9", "u1", { isFronted: false });
        await updateExpense({ ...splitAttack, id: "e9", amount: 1000 }, repo);

        // The clamp is for fronted rows only — normal sharing is untouched.
        expect(repo.updates[0]!.data.isShared).toBe(true);
        expect(repo.updates[0]!.data.actualExpenditure).toBe(680);
    });
});

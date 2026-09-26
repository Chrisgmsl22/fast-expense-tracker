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
 * The ordinary expense form must not shrink a payment. A payment row opens in that
 * form, which offers the split — and `actualExpenditure` is what the balance reads as
 * "what he paid her", so a 68% split would quietly drop it by a third.
 */
const PAYMENT = 680;
const DAY = new Date("2026-09-10T06:00:00Z");
const NOW = new Date("2026-09-15T12:00:00Z");

/** The payment's own description — what it SENT, not what is owed. */
const PAID_LABEL = "Transfer — you paid Brenda";

/** The attack: open the payment, tick "shared" at the usual 68%, save. */
const splitAttack = {
    id: "pay1",
    date: "2026-09-10",
    amount: PAYMENT,
    categoryId: "combined",
    description: PAID_LABEL,
    isShared: true,
    yourPercentage: 0.68,
    paidBy: "you",
};

function seededRepo() {
    const repo = new FakeExpenseRepository();
    repo.seedExpense("pay1", "u1", {
        isPartnerPayment: true,
        categoryId: "combined",
        amount: PAYMENT,
        actualExpenditure: PAYMENT,
        description: PAID_LABEL,
        date: DAY,
    });
    return repo;
}

/** The real case: a payment stored with its default "Covered for me" subcategory. */
function seededRepoWithSubcategory() {
    const repo = seededRepo();
    repo.setSubcategory("covered", "combined");
    repo.seedExpense("pay1", "u1", {
        isPartnerPayment: true,
        categoryId: "combined",
        subcategoryId: "covered",
        amount: PAYMENT,
        actualExpenditure: PAYMENT,
        description: PAID_LABEL,
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

describe("editing a partner payment through the ordinary expense form", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("refuses the split outright — no write, and the balance does not move", async () => {
        const repo = seededRepo();
        const res = await updateExpense(splitAttack, repo);

        // Refused, not quietly coerced: a "saved" answer to an ignored change is a silent save failure.
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.message).toMatch(/whole transfer/i);
        expect(res.fieldErrors?.yourPercentage).toBeDefined();
        expect(repo.updates).toHaveLength(0);

        // The stored row is untouched, so the balance still reads the full
        // payment.
        const settlement = await settlementFrom({
            id: "pay1",
            date: DAY,
            description: PAID_LABEL,
            amount: PAYMENT,
            actualExpenditure: PAYMENT,
            isShared: false,
            isPartnerPayment: true,
            fundedFrom: "income",
            createdAt: DAY,
        });
        // A payment draws the balance the other way now (spec 0007 §6b).
        expect(settlement.balance.direction).toBe("she_owes");
        expect(settlement.balance.amount).toBe(PAYMENT);
        expect(settlement.breakdownItems.you_paid[0]!.amount).toBe(PAYMENT);
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
        expect(saved.actualExpenditure).toBe(PAYMENT);
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
        repo.seedExpense("e9", "u1", { isPartnerPayment: false });
        await updateExpense({ ...splitAttack, id: "e9", amount: 1000 }, repo);

        // The clamp is for payment rows only — normal sharing is untouched.
        expect(repo.updates[0]!.data.isShared).toBe(true);
        expect(repo.updates[0]!.data.actualExpenditure).toBe(680);
    });

    // A payment edited from ANY dialog must keep its category and can never
    // read as reimbursed, or it drops out of the partner lines and the
    // budget silently.
    it("refuses a category change, rather than saving and dropping it in silence", async () => {
        const repo = seededRepo();
        const res = await updateExpense(
            { ...splitAttack, isShared: false, categoryId: "groceries" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.categoryId).toBeDefined();
        expect(repo.updates).toHaveLength(0);
    });

    it("refuses a subcategory change", async () => {
        const repo = seededRepo();
        // Owned by "combined" too, so the FK-ownership check passes and the
        // payment guard — not the ownership check — is what fires here.
        repo.setSubcategory("covered", "combined");
        const res = await updateExpense(
            {
                ...splitAttack,
                isShared: false,
                categoryId: "combined",
                subcategoryId: "covered",
            },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.subcategoryId).toBeDefined();
        expect(repo.updates).toHaveLength(0);
    });

    it("refuses fundedFrom: reimbursed — a payment can never be reimbursed", async () => {
        const repo = seededRepo();
        // Health, so the general Health-only funding rule would ALLOW
        // `reimbursed` here — proving this refusal is the payment-specific one,
        // not a side effect of the unrelated category rule.
        repo.setCategorySlug("combined", "health");
        const res = await updateExpense(
            {
                ...splitAttack,
                isShared: false,
                fundedFrom: "reimbursed",
            },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.fundedFrom).toBeDefined();
        expect(repo.updates).toHaveLength(0);
    });

    it("saves when the payload repeats the stored subcategory", async () => {
        const repo = seededRepoWithSubcategory();
        const res = await updateExpense(
            {
                ...splitAttack,
                isShared: false,
                categoryId: "combined",
                subcategoryId: "covered",
            },
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.updates[0]!.data.subcategoryId).toBe("covered");
    });

    it("refuses when the payload omits a subcategory the row has stored", async () => {
        const repo = seededRepoWithSubcategory();
        const res = await updateExpense(
            { ...splitAttack, isShared: false, categoryId: "combined" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.subcategoryId).toBeDefined();
        expect(repo.updates).toHaveLength(0);
    });

    it("still saves an income -> savings edit of a payment", async () => {
        const repo = seededRepo();
        const res = await updateExpense(
            {
                ...splitAttack,
                isShared: false,
                fundedFrom: "savings",
            },
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.updates[0]!.data.fundedFrom).toBe("savings");
    });
});

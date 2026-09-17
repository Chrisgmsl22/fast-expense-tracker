import { describe, expect, it } from "vitest";

import {
    canCloseCycle,
    computeCoupleBalance,
    cycleCloseAtOrAfter,
    isBalanceSettled,
} from "@/lib/domain/settlement";

const inputs = (
    over: Partial<Parameters<typeof computeCoupleBalance>[0]> = {},
) => ({
    partnerShareOfYourExpenses: 0,
    yourDebtToPartner: 0,
    moneyPartnerPaidYou: 0,
    moneyYouPaidPartner: 0,
    ...over,
});

describe("computeCoupleBalance", () => {
    it("she owes you her share of what you paid", () => {
        const r = computeCoupleBalance(
            inputs({ partnerShareOfYourExpenses: 1000 }),
        );
        expect(r.balance).toBe(1000);
        expect(r.amount).toBe(1000);
        expect(r.direction).toBe("she_owes");
    });

    it("you owe her for a logged debt", () => {
        const r = computeCoupleBalance(inputs({ yourDebtToPartner: 500 }));
        expect(r.balance).toBe(-500);
        expect(r.amount).toBe(500);
        expect(r.direction).toBe("you_owe");
    });

    // Worked scenarios from spec 0004 §2.4 — all settle to 0.
    it("scenario: she owes 1000, pays 1000 → settled", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 1000,
                moneyPartnerPaidYou: 1000,
            }),
        );
        expect(r.balance).toBe(0);
        expect(r.direction).toBe("settled");
    });

    it("scenario: she owes 1000, you owe 300, she pays 700 → settled", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 1000,
                yourDebtToPartner: 300,
                moneyPartnerPaidYou: 700,
            }),
        );
        expect(r.balance).toBe(0);
        expect(r.direction).toBe("settled");
    });

    it("scenario: she owes 500, you owe 700, you pay 200 → settled", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 500,
                yourDebtToPartner: 700,
                moneyYouPaidPartner: 200,
            }),
        );
        expect(r.balance).toBe(0);
        expect(r.direction).toBe("settled");
    });

    it("money she paid you (moneyPartnerPaidYou) draws down what she owes", () => {
        // she owes 1000; she sent you 600 (gf_received transfers) → 400 left
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 1000,
                moneyPartnerPaidYou: 600,
            }),
        );
        expect(r.balance).toBe(400);
        expect(r.direction).toBe("she_owes");
    });

    it("rounds float drift to cents", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 0.1,
                moneyYouPaidPartner: 0.2,
            }),
        );
        expect(r.balance).toBe(0.3);
    });

    it("exposes the four signed breakdown lines", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 1000,
                yourDebtToPartner: 300,
                moneyPartnerPaidYou: 50,
                moneyYouPaidPartner: 20,
            }),
        );
        expect(r.breakdown).toEqual([
            { key: "partner_share", sign: "+", amount: 1000 },
            { key: "your_debt", sign: "-", amount: 300 },
            { key: "partner_paid", sign: "-", amount: 50 },
            { key: "you_paid", sign: "+", amount: 20 },
        ]);
    });
});

describe("isBalanceSettled", () => {
    it("is true when the net balance is zero", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 1000,
                moneyPartnerPaidYou: 1000,
            }),
        );
        expect(isBalanceSettled(r)).toBe(true);
    });

    it("is false when she still owes you", () => {
        const r = computeCoupleBalance(
            inputs({ partnerShareOfYourExpenses: 400 }),
        );
        expect(isBalanceSettled(r)).toBe(false);
    });

    it("is false when you still owe her", () => {
        const r = computeCoupleBalance(inputs({ yourDebtToPartner: 250 }));
        expect(isBalanceSettled(r)).toBe(false);
    });

    it("only a transfer MOVEMENT may carry the cycle marker", () => {
        expect(canCloseCycle("gf_paid")).toBe(true);
        expect(canCloseCycle("gf_received")).toBe(true);
        // A debt or a card payment never closes a cycle — real money squares it.
        expect(canCloseCycle("gf_fronted")).toBe(false);
        expect(canCloseCycle("card_payment")).toBe(false);
        expect(canCloseCycle("income")).toBe(false);
        expect(canCloseCycle("other")).toBe(false);
    });

    it("treats sub-cent Float drift as settled", () => {
        // 0.1 - 0.1 rounds to exactly 0, but a synthetic drift under half a cent
        // must still read as settled.
        expect(
            isBalanceSettled({
                balance: 0.004,
                amount: 0.004,
                direction: "she_owes",
                breakdown: [],
            }),
        ).toBe(true);
    });
});

/**
 * The choice this makes IS the closed-cycle freeze. It used to live inside a Prisma
 * query, where none of it could be tested.
 */
describe("cycleCloseAtOrAfter", () => {
    const early = new Date("2026-07-01T00:00:00Z");
    const mid = new Date("2026-08-01T00:00:00Z");
    const late = new Date("2026-09-01T00:00:00Z");

    it("returns nothing when no cycle has ever closed", () => {
        expect(cycleCloseAtOrAfter([], mid)).toBeNull();
    });

    it("returns nothing for a row entered after the last close — that cycle is open", () => {
        expect(
            cycleCloseAtOrAfter([early, mid], new Date("2026-08-02T00:00:00Z")),
        ).toBeNull();
    });

    it("picks the FIRST close after the row, not just any later one", () => {
        // Picking `late` would freeze the row against a settlement two cycles
        // after the one it was actually counted in.
        expect(
            cycleCloseAtOrAfter(
                [late, early, mid],
                new Date("2026-07-15T00:00:00Z"),
            ),
        ).toBe(mid);
    });

    it("does not depend on the order it receives the closes in", () => {
        const entered = new Date("2026-07-15T00:00:00Z");
        expect(cycleCloseAtOrAfter([mid, late], entered)).toBe(
            cycleCloseAtOrAfter([late, mid], entered),
        );
    });

    it("includes a row entered at the exact close instant", () => {
        // The boundary is `>=`: a cycle runs up to AND INCLUDING its own close,
        // so the transfer that closes it belongs to it, not to the next one.
        expect(cycleCloseAtOrAfter([mid, late], mid)).toBe(mid);
    });

    it("excludes a row entered one millisecond after the close", () => {
        const justAfter = new Date(mid.getTime() + 1);
        expect(cycleCloseAtOrAfter([mid], justAfter)).toBeNull();
        expect(cycleCloseAtOrAfter([mid, late], justAfter)).toBe(late);
    });
});

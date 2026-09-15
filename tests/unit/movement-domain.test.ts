import { describe, expect, it } from "vitest";

import { computeFeedTotals, partnerShareTotal } from "@/lib/domain/movement";

const shared = (amount: number, yourPct: number) => ({
    amount,
    actualExpenditure: amount * yourPct,
});

describe("partnerShareTotal", () => {
    it("sums the non-yours slice of each shared expense", () => {
        // 1000 @ 68% → partner 320; 500 @ 68% → partner 160 ⇒ 480
        expect(partnerShareTotal([shared(1000, 0.68), shared(500, 0.68)])).toBe(
            480,
        );
    });

    it("contributes 0 for an unshared expense (amount === your share)", () => {
        expect(
            partnerShareTotal([{ amount: 1000, actualExpenditure: 1000 }]),
        ).toBe(0);
    });

    it("is 0 for no expenses", () => {
        expect(partnerShareTotal([])).toBe(0);
    });
});

describe("computeFeedTotals", () => {
    const groceries = {
        amount: 1000,
        actualExpenditure: 680,
        isPartnerPayment: false,
        category: { slug: "groceries" },
    };
    const savings = {
        amount: 5000,
        actualExpenditure: 5000,
        isPartnerPayment: false,
        category: { slug: "savings" },
    };

    it("splits consumption from the savings transfer", () => {
        const t = computeFeedTotals([groceries, savings]);
        expect(t.charged).toBe(1000); // savings excluded from charged
        expect(t.whatIReallySpent).toBe(680);
        expect(t.setAside).toBe(5000);
    });

    it("counts a payment to the partner as spend, exactly once", () => {
        const payment = {
            amount: 100,
            actualExpenditure: 100,
            isPartnerPayment: true,
            category: { slug: "combined-expenses" },
        };
        const t = computeFeedTotals([groceries, payment]);

        // A payment IS spending now (spec 0007 §6b), so it sits inside the
        // figure; `paidToPartner` reports that same money as a breakdown, never
        // as an addend, or the payment would be billed twice.
        expect(t.whatIReallySpent).toBe(780);
        expect(t.paidToPartner).toBe(100);
        expect(t.total).toBe(780);
    });

    it("total = spent + set aside, with nothing added on top", () => {
        const t = computeFeedTotals([groceries, savings]);
        expect(t.total).toBe(680 + 5000);
    });

    it("is all zeros for an empty month", () => {
        expect(computeFeedTotals([])).toEqual({
            charged: 0,
            whatIReallySpent: 0,
            setAside: 0,
            paidToPartner: 0,
            total: 0,
        });
    });
});

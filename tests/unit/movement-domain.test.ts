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
        category: { slug: "groceries" },
        fundedFrom: "income" as const,
    };
    const savings = {
        amount: 5000,
        actualExpenditure: 5000,
        category: { slug: "savings" },
        fundedFrom: "income" as const,
    };

    /** A `gf_paid` transfer as the footer totals read it. */
    const transfer = (amount: number, fundedFrom: "income" | "savings") => [
        { type: "gf_paid" as const, amount, fundedFrom },
    ];

    it("splits consumption from the savings transfer", () => {
        const t = computeFeedTotals([groceries, savings], []);
        expect(t.charged).toBe(1000); // savings excluded from charged
        expect(t.whatIReallySpent).toBe(680);
        expect(t.setAside).toBe(5000);
    });

    it("adds transfers to the partner into the total, not into spend", () => {
        const t = computeFeedTotals([groceries], transfer(100, "income"));
        expect(t.whatIReallySpent).toBe(680); // transfer not counted as spend
        expect(t.paidToPartner).toBe(100);
        expect(t.total).toBe(780); // 680 spent + 0 saved + 100 paid
    });

    it("total = spent + set aside + paid to partner", () => {
        const t = computeFeedTotals(
            [groceries, savings],
            transfer(100, "income"),
        );
        expect(t.total).toBe(680 + 5000 + 100);
    });

    describe("a savings-funded transfer (spec 0007 §6a decision 5)", () => {
        it("leaves 'Paid to {partner}' and the cash total", () => {
            const t = computeFeedTotals([groceries], transfer(800, "savings"));
            expect(t.paidToPartner).toBe(0);
            expect(t.total).toBe(680);
        });

        it("is surfaced as its own CASH figure, not folded into consumption", () => {
            // `notFromIncome` is the consumption ledger. Adding a transfer to
            // it would sum across ledgers (spec 0007 §6a).
            const t = computeFeedTotals([], transfer(800, "savings"));
            expect(t.notFromIncomeTransfers).toBe(800);
            expect(t.notFromIncome).toBe(0);
        });

        it("does not affect an income-funded transfer beside it", () => {
            const t = computeFeedTotals(
                [],
                [
                    { type: "gf_paid", amount: 800, fundedFrom: "savings" },
                    { type: "gf_paid", amount: 200, fundedFrom: "income" },
                ],
            );
            expect(t.paidToPartner).toBe(200);
            expect(t.notFromIncomeTransfers).toBe(800);
        });
    });

    it("counts only gf_paid — a card payment or inbound transfer is not spend", () => {
        const t = computeFeedTotals(
            [],
            [
                { type: "card_payment", amount: 5000, fundedFrom: "income" },
                { type: "gf_received", amount: 300, fundedFrom: "income" },
                { type: "gf_fronted", amount: 400, fundedFrom: "income" },
            ],
        );
        expect(t.paidToPartner).toBe(0);
        expect(t.notFromIncomeTransfers).toBe(0);
        expect(t.total).toBe(0);
    });

    it("is all zeros for an empty month", () => {
        expect(computeFeedTotals([], [])).toEqual({
            charged: 0,
            whatIReallySpent: 0,
            setAside: 0,
            paidToPartner: 0,
            notFromIncome: 0,
            notFromIncomeTransfers: 0,
            total: 0,
        });
    });
});

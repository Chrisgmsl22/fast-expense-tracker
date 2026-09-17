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
        id: "e1",
        amount: 1000,
        actualExpenditure: 680,
        isPartnerPayment: false,
        category: { slug: "groceries" },
        fundedFrom: "income" as const,
    };
    const savings = {
        id: "e2",
        amount: 5000,
        actualExpenditure: 5000,
        isPartnerPayment: false,
        category: { slug: "savings" },
        fundedFrom: "income" as const,
    };

    /** A LEGACY `gf_paid` movement as the footer totals read it. */
    const transfer = (amount: number, fundedFrom: "income" | "savings") => [
        { id: "m1", type: "gf_paid" as const, amount, fundedFrom },
    ];

    it("splits consumption from the savings transfer", () => {
        const t = computeFeedTotals([groceries, savings]);
        expect(t.charged).toBe(1000); // savings excluded from charged
        expect(t.whatIReallySpent).toBe(680);
        expect(t.setAside).toBe(5000);
    });

    it("counts a payment to the partner as spend, exactly once", () => {
        const payment = {
            id: "e3",
            amount: 100,
            actualExpenditure: 100,
            isPartnerPayment: true,
            category: { slug: "combined-expenses" },
            fundedFrom: "income" as const,
        };
        const t = computeFeedTotals([groceries, payment]);

        // A payment IS spending now (spec 0007 §6b), so `paidToPartner` reports it as a
        // breakdown, never an addend — or it is billed twice.
        expect(t.whatIReallySpent).toBe(780);
        expect(t.paidToPartner).toBe(100);
        expect(t.legacyPaidToPartner).toBe(0);
        expect(t.total).toBe(780);
    });

    it("adds a LEGACY transfer to the total, not to spend", () => {
        const t = computeFeedTotals([groceries], transfer(100, "income"));
        // It has no consumption row behind it, so it is the one addend (ADR-0024).
        expect(t.whatIReallySpent).toBe(680);
        expect(t.paidToPartner).toBe(100);
        expect(t.legacyPaidToPartner).toBe(100);
        expect(t.total).toBe(780);
    });

    it("total = spent + set aside, with nothing added on top", () => {
        const t = computeFeedTotals([groceries, savings]);
        expect(t.total).toBe(680 + 5000);
    });

    it("total = spent + set aside + the legacy transfer", () => {
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
                    {
                        id: "m1",
                        type: "gf_paid",
                        amount: 800,
                        fundedFrom: "savings",
                    },
                    {
                        id: "m2",
                        type: "gf_paid",
                        amount: 200,
                        fundedFrom: "income",
                    },
                ],
            );
            expect(t.paidToPartner).toBe(200);
            expect(t.legacyPaidToPartner).toBe(200);
            expect(t.notFromIncomeTransfers).toBe(800);
        });

        it("drops a converted twin from BOTH cash figures", () => {
            // The conversion reuses the movement id (ADR-0024). Without the skip
            // the same money reads twice — once per ledger.
            const converted = {
                id: "m1",
                amount: 800,
                actualExpenditure: 800,
                isPartnerPayment: true,
                category: { slug: "combined-expenses" },
                fundedFrom: "savings" as const,
            };
            const t = computeFeedTotals([converted], transfer(800, "savings"));
            expect(t.notFromIncomeTransfers).toBe(0);
            expect(t.notFromIncome).toBe(800);
        });
    });

    describe("a savings-funded payment to the partner (spec 0007 §6a decision 2)", () => {
        const payment = {
            id: "e3",
            amount: 680,
            actualExpenditure: 680,
            isPartnerPayment: true,
            category: { slug: "combined-expenses" },
            fundedFrom: "savings" as const,
        };

        it("is consumption the budget skips, not a cash transfer", () => {
            const t = computeFeedTotals([groceries, payment]);
            // It is an EXPENSE, so it belongs to the consumption ledger even
            // though the money came from another month.
            expect(t.notFromIncome).toBe(680);
            expect(t.notFromIncomeTransfers).toBe(0);
        });

        it("leaves every budget figure and the total untouched", () => {
            const t = computeFeedTotals([groceries, payment]);
            expect(t.whatIReallySpent).toBe(680);
            expect(t.setAside).toBe(0);
            // `paidToPartner` breaks down `whatIReallySpent`, which this row left.
            expect(t.paidToPartner).toBe(0);
            expect(t.total).toBe(680);
        });

        it("still counts in `charged` — the card saw it (spec 0007 §3.2)", () => {
            const t = computeFeedTotals([payment]);
            expect(t.charged).toBe(680);
        });

        it("is named on its own line, not lost among the savings rows (BUG-5)", () => {
            const t = computeFeedTotals([groceries, payment]);
            expect(t.paidToPartnerFromSavings).toBe(680);
            // The income-funded figure must not claim it.
            expect(t.paidToPartner).toBe(0);
        });

        it("changes no figure it only breaks down", () => {
            const without = computeFeedTotals([groceries]);
            const t = computeFeedTotals([groceries, payment]);
            expect(t.total).toBe(without.total);
            expect(t.whatIReallySpent).toBe(without.whatIReallySpent);
            expect(t.setAside).toBe(without.setAside);
            expect(t.notFromIncome).toBe(680);
        });

        it("adds up with a savings-funded LEGACY transfer beside it", () => {
            // Two shapes of the same economic event until CHORE-12 converts the
            // rows, so one line has to report both.
            const t = computeFeedTotals(
                [groceries, payment],
                transfer(800, "savings"),
            );
            expect(t.paidToPartnerFromSavings).toBe(1480);
            expect(t.total).toBe(680);
        });

        it("counts a converted twin once", () => {
            const converted = { ...payment, id: "m1" };
            const t = computeFeedTotals([converted], transfer(680, "savings"));
            expect(t.paidToPartnerFromSavings).toBe(680);
            expect(t.notFromIncomeTransfers).toBe(0);
        });

        it("reports the owner's October pair as one $530 line", () => {
            const pay = (id: string, amount: number) => ({
                ...payment,
                id,
                amount,
                actualExpenditure: amount,
            });
            const t = computeFeedTotals([pay("a", 300), pay("b", 230)]);
            expect(t.paidToPartnerFromSavings).toBe(530);
            expect(t.total).toBe(0);
        });
    });

    it("counts only gf_paid — a card payment or inbound transfer is not spend", () => {
        const t = computeFeedTotals(
            [],
            [
                {
                    id: "m1",
                    type: "card_payment",
                    amount: 5000,
                    fundedFrom: "income",
                },
                {
                    id: "m2",
                    type: "gf_received",
                    amount: 300,
                    fundedFrom: "income",
                },
                {
                    id: "m3",
                    type: "gf_fronted",
                    amount: 400,
                    fundedFrom: "income",
                },
            ],
        );
        expect(t.paidToPartner).toBe(0);
        expect(t.notFromIncomeTransfers).toBe(0);
        expect(t.total).toBe(0);
    });

    it("is all zeros for an empty month", () => {
        expect(computeFeedTotals([])).toEqual({
            charged: 0,
            whatIReallySpent: 0,
            setAside: 0,
            paidToPartner: 0,
            legacyPaidToPartner: 0,
            notFromIncome: 0,
            notFromIncomeTransfers: 0,
            paidToPartnerFromSavings: 0,
            total: 0,
        });
    });
});

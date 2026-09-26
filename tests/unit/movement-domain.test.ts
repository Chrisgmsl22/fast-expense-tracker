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
        expect(t.charged.amount).toBe(1000); // savings excluded from charged
        expect(t.whatIReallySpent.amount).toBe(680);
        expect(t.setAside).toBe(5000);
    });

    it("cuts the charge into my income, my other money, and her share", () => {
        const fromSavings = {
            ...groceries,
            id: "e9",
            amount: 400,
            actualExpenditure: 400,
            fundedFrom: "savings" as const,
        };
        const t = computeFeedTotals([groceries, fromSavings]);

        expect(t.charged.of.myIncome).toBe(680);
        expect(t.charged.of.myNonIncome).toBe(400);
        expect(t.charged.of.partnerShare).toBe(320);
        // The parts ARE the charge — nothing rounded off the edge.
        expect(t.charged.amount).toBe(1400);
    });

    it("keeps a savings-CATEGORY row out of the charge slices", () => {
        // Nothing was charged for it, so it can only distort the donut.
        const t = computeFeedTotals([
            { ...savings, fundedFrom: "savings" as const },
        ]);

        expect(t.charged.amount).toBe(0);
        expect(t.charged.of.myNonIncome).toBe(0);
        // …while the consumption ledger still reports it.
        expect(t.notFromIncome.amount).toBe(5000);
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

        // A payment IS spending now (spec 0007 §6b), so it is a BREAKDOWN of what
        // I really spent, never an addend — or it is billed twice.
        expect(t.whatIReallySpent.amount).toBe(780);
        expect(t.whatIReallySpent.of.sentToPartner).toBe(100);
        expect(t.whatIReallySpent.of.spentOnMyself).toBe(680);
        expect(t.paidToPartner.amount).toBe(100);
        expect(t.paidToPartner.of.fromIncome.of.fromLegacyTransfers).toBe(0);
        expect(t.total).toBe(780);
    });

    it("adds a LEGACY transfer to the total, not to spend", () => {
        const t = computeFeedTotals([groceries], transfer(100, "income"));
        // It has no consumption row behind it, so it is the one addend (ADR-0024).
        expect(t.whatIReallySpent.amount).toBe(680);
        expect(t.paidToPartner.amount).toBe(100);
        expect(t.paidToPartner.of.fromIncome.of.fromLegacyTransfers).toBe(100);
        expect(t.paidToPartner.of.fromIncome.of.fromPaymentExpenses).toBe(0);
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

    it("reports what the partner sent you, netted against nothing", () => {
        const t = computeFeedTotals(
            [groceries],
            [
                {
                    id: "m1",
                    type: "gf_received",
                    amount: 3200,
                    fundedFrom: "income",
                },
            ],
        );

        expect(t.partnerPaidYou).toBe(3200);
        // Cash in is not consumption and not a deduction (spec 0007 §6a).
        expect(t.whatIReallySpent.amount).toBe(680);
        expect(t.total).toBe(680);
        expect(t.paidToPartner.amount).toBe(0);
    });

    describe("a savings-funded transfer (spec 0007 §6a decision 5)", () => {
        it("leaves the income figures and the cash total", () => {
            const t = computeFeedTotals([groceries], transfer(800, "savings"));
            expect(t.paidToPartner.of.fromIncome.amount).toBe(0);
            expect(t.total).toBe(680);
        });

        it("is surfaced as its own CASH figure, not folded into consumption", () => {
            // `notFromIncome` is the consumption ledger. Adding a transfer to
            // it would sum across ledgers (spec 0007 §6a).
            const t = computeFeedTotals([], transfer(800, "savings"));
            expect(
                t.paidToPartner.of.notFromIncome.of.fromLegacyTransfers,
            ).toBe(800);
            expect(t.notFromIncome.amount).toBe(0);
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
            expect(t.paidToPartner.of.fromIncome.amount).toBe(200);
            expect(t.paidToPartner.of.notFromIncome.amount).toBe(800);
            expect(t.paidToPartner.amount).toBe(1000);
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
            expect(
                t.paidToPartner.of.notFromIncome.of.fromLegacyTransfers,
            ).toBe(0);
            expect(t.paidToPartner.amount).toBe(800);
            expect(t.notFromIncome.amount).toBe(800);
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
            expect(t.notFromIncome.amount).toBe(680);
            expect(
                t.paidToPartner.of.notFromIncome.of.fromLegacyTransfers,
            ).toBe(0);
        });

        it("leaves every budget figure and the total untouched", () => {
            const t = computeFeedTotals([groceries, payment]);
            expect(t.whatIReallySpent.amount).toBe(680);
            expect(t.setAside).toBe(0);
            expect(t.paidToPartner.of.fromIncome.amount).toBe(0);
            expect(t.total).toBe(680);
        });

        it("still counts in `charged` — the card saw it (spec 0007 §3.2)", () => {
            const t = computeFeedTotals([payment]);
            expect(t.charged.amount).toBe(680);
        });

        it("sits INSIDE the non-income figure, never beside it (BUG-5)", () => {
            const t = computeFeedTotals([groceries, payment]);

            expect(t.notFromIncome.of.sentToPartner).toBe(680);
            expect(t.notFromIncome.of.ownSpending).toBe(0);
            // The same money, re-cut as "what reached her" — the type says it is
            // the payment-expense slice, so no reader can add the two.
            expect(
                t.paidToPartner.of.notFromIncome.of.fromPaymentExpenses,
            ).toBe(t.notFromIncome.of.sentToPartner);
            expect(t.paidToPartner.of.fromIncome.amount).toBe(0);
        });

        it("changes no figure it only breaks down", () => {
            const without = computeFeedTotals([groceries]);
            const t = computeFeedTotals([groceries, payment]);
            expect(t.total).toBe(without.total);
            expect(t.whatIReallySpent.amount).toBe(
                without.whatIReallySpent.amount,
            );
            expect(t.setAside).toBe(without.setAside);
            expect(t.notFromIncome.amount).toBe(680);
        });

        it("adds up with a savings-funded LEGACY transfer beside it", () => {
            // Two shapes of the same economic event until CHORE-12 converts the
            // rows, so one figure has to report both (spec 0007 §6a carve-out).
            const t = computeFeedTotals(
                [groceries, payment],
                transfer(800, "savings"),
            );
            expect(t.paidToPartner.of.notFromIncome.amount).toBe(1480);
            expect(t.total).toBe(680);
        });

        it("counts a converted twin once", () => {
            const converted = { ...payment, id: "m1" };
            const t = computeFeedTotals([converted], transfer(680, "savings"));
            expect(t.paidToPartner.of.notFromIncome.amount).toBe(680);
            expect(
                t.paidToPartner.of.notFromIncome.of.fromLegacyTransfers,
            ).toBe(0);
        });

        it("reports the owner's October pair as one $530 figure", () => {
            const pay = (id: string, amount: number) => ({
                ...payment,
                id,
                amount,
                actualExpenditure: amount,
            });
            const t = computeFeedTotals([pay("a", 300), pay("b", 230)]);
            expect(t.paidToPartner.amount).toBe(530);
            expect(t.notFromIncome.of.sentToPartner).toBe(530);
            expect(t.total).toBe(0);
        });
    });

    describe("every parent is the sum of its own parts", () => {
        const month = [
            groceries,
            savings,
            {
                id: "p1",
                amount: 900,
                actualExpenditure: 900,
                isPartnerPayment: true,
                category: { slug: "combined-expenses" },
                fundedFrom: "income" as const,
            },
            {
                id: "p2",
                amount: 300,
                actualExpenditure: 300,
                isPartnerPayment: true,
                category: { slug: "combined-expenses" },
                fundedFrom: "savings" as const,
            },
            {
                id: "s3",
                amount: 450,
                actualExpenditure: 450,
                isPartnerPayment: false,
                category: { slug: "shopping" },
                fundedFrom: "savings" as const,
            },
        ];
        const movements = [
            {
                id: "m1",
                type: "gf_paid" as const,
                amount: 700,
                fundedFrom: "income" as const,
            },
            {
                id: "m2",
                type: "gf_paid" as const,
                amount: 250,
                fundedFrom: "savings" as const,
            },
            {
                id: "m3",
                type: "gf_received" as const,
                amount: 400,
                fundedFrom: "income" as const,
            },
        ];

        it("holds for the charge, the spend, the non-income figure and the partner", () => {
            const t = computeFeedTotals(month, movements);
            const { charged, whatIReallySpent, notFromIncome, paidToPartner } =
                t;

            expect(charged.amount).toBe(
                charged.of.myIncome +
                    charged.of.myNonIncome +
                    charged.of.partnerShare,
            );
            expect(whatIReallySpent.amount).toBe(
                whatIReallySpent.of.spentOnMyself +
                    whatIReallySpent.of.sentToPartner,
            );
            expect(notFromIncome.amount).toBe(
                notFromIncome.of.ownSpending + notFromIncome.of.sentToPartner,
            );
            expect(paidToPartner.amount).toBe(
                paidToPartner.of.fromIncome.amount +
                    paidToPartner.of.notFromIncome.amount,
            );
            for (const slice of [
                paidToPartner.of.fromIncome,
                paidToPartner.of.notFromIncome,
            ]) {
                expect(slice.amount).toBe(
                    slice.of.fromPaymentExpenses + slice.of.fromLegacyTransfers,
                );
            }
        });

        it("keeps the charge's income slice equal to what I really spent", () => {
            const t = computeFeedTotals(month, movements);
            expect(t.charged.of.myIncome).toBe(t.whatIReallySpent.amount);
        });

        it("closes the total with the one addend it may take", () => {
            const t = computeFeedTotals(month, movements);
            expect(t.total).toBe(
                t.whatIReallySpent.amount +
                    t.setAside +
                    t.paidToPartner.of.fromIncome.of.fromLegacyTransfers,
            );
            // The owner's bottom line: two slices that do not overlap.
            expect(
                t.whatIReallySpent.of.spentOnMyself +
                    t.paidToPartner.of.fromIncome.amount +
                    t.setAside,
            ).toBe(t.total);
        });
    });

    it("counts only gf_paid and gf_received — a card payment is neither", () => {
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
                    id: "m3",
                    type: "gf_fronted",
                    amount: 400,
                    fundedFrom: "income",
                },
            ],
        );
        expect(t.paidToPartner.amount).toBe(0);
        expect(t.partnerPaidYou).toBe(0);
        expect(t.total).toBe(0);
    });

    it("is all zeros for an empty month", () => {
        expect(computeFeedTotals([])).toEqual({
            charged: {
                amount: 0,
                of: { myIncome: 0, myNonIncome: 0, partnerShare: 0 },
            },
            whatIReallySpent: {
                amount: 0,
                of: { spentOnMyself: 0, sentToPartner: 0 },
            },
            setAside: 0,
            notFromIncome: {
                amount: 0,
                of: { ownSpending: 0, sentToPartner: 0 },
                fromSavings: {
                    amount: 0,
                    of: { ownSpending: 0, sentToPartner: 0 },
                },
                reimbursed: {
                    amount: 0,
                    of: { ownSpending: 0, sentToPartner: 0 },
                },
            },
            paidToPartner: {
                amount: 0,
                of: {
                    fromIncome: {
                        amount: 0,
                        of: { fromPaymentExpenses: 0, fromLegacyTransfers: 0 },
                    },
                    notFromIncome: {
                        amount: 0,
                        of: { fromPaymentExpenses: 0, fromLegacyTransfers: 0 },
                    },
                },
            },
            partnerPaidYou: 0,
            total: 0,
        });
    });
});

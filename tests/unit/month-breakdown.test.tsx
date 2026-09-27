import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { PotParts } from "@/components/money/BreakdownParts";
import { Donut } from "@/components/money/Donut";
import { MonthBreakdown } from "@/components/money/MonthBreakdown";
import { SummaryRail } from "@/components/money/SummaryRail";
import {
    computeFeedTotals,
    type FeedTotalExpense,
    type FeedTotalMovement,
} from "@/lib/domain/movement";
import { fundingRowsOf } from "@/tests/support/funding-rows";

const NO_ROWS = fundingRowsOf([]);

const expense = (
    over: Partial<FeedTotalExpense> & Pick<FeedTotalExpense, "id">,
): FeedTotalExpense => ({
    amount: 0,
    actualExpenditure: 0,
    isPartnerPayment: false,
    category: { slug: "groceries" },
    fundedFrom: "income",
    ...over,
});

/** A shared charge, a payment she was sent, and a savings-funded purchase. */
const month: FeedTotalExpense[] = [
    expense({ id: "e1", amount: 1000, actualExpenditure: 680 }),
    expense({
        id: "e2",
        amount: 400,
        actualExpenditure: 400,
        isPartnerPayment: true,
        category: { slug: "combined-expenses" },
    }),
    expense({
        id: "e3",
        amount: 250,
        actualExpenditure: 250,
        fundedFrom: "savings",
        category: { slug: "shopping" },
    }),
];

const movements: FeedTotalMovement[] = [
    { id: "m1", type: "gf_paid", amount: 700, fundedFrom: "income" },
    { id: "m2", type: "gf_received", amount: 900, fundedFrom: "income" },
];

const totals = computeFeedTotals(month, movements);

describe("MonthBreakdown", () => {
    it("names both pots and the budget figure", () => {
        render(
            <MonthBreakdown
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
                incomeTotal={4000}
            />,
        );

        expect(screen.getByText("This month's income")).toBeDefined();
        // Income that LEFT: 1,080 of consumption plus the 700 legacy transfer.
        const pot = screen.getByText(
            "all but the transfers count toward your budget buckets",
        ).parentElement!;
        expect(within(pot).getByText("$1,780.00")).toBeDefined();
        expect(within(pot).getByText("Spent")).toBeDefined();
        expect(within(pot).getByText("$1,080.00")).toBeDefined();
        expect(within(pot).getByText("Transfers to Brenda")).toBeDefined();
        expect(within(pot).getByText("$700.00")).toBeDefined();
        expect(within(pot).getByText("45% of your income")).toBeDefined();
        expect(
            screen.getAllByText("Not from this month's income").length,
        ).toBeGreaterThan(0);
        expect(screen.getAllByText("$250.00").length).toBeGreaterThan(0);
    });

    describe("a month BEFORE the CHORE-12 conversion", () => {
        // The owner's real September: most of what left his income was a legacy
        // `gf_paid` with no expense row behind it. Localhost cannot show this —
        // its rows are converted — so the fixture is the only place it is visible.
        const septemberExpenses = [
            expense({
                id: "e1",
                amount: 16298.99,
                actualExpenditure: 11403.3,
            }),
            expense({
                id: "e2",
                amount: 8047.52,
                actualExpenditure: 8047.52,
                isPartnerPayment: true,
                category: { slug: "combined-expenses" },
            }),
            expense({
                id: "e3",
                amount: 11700,
                actualExpenditure: 11700,
                fundedFrom: "savings",
                category: { slug: "shopping" },
            }),
        ];
        const september = computeFeedTotals(septemberExpenses, [
            {
                id: "m1",
                type: "gf_paid",
                amount: 15418.71,
                fundedFrom: "income",
            },
            {
                id: "m2",
                type: "gf_paid",
                amount: 1000,
                fundedFrom: "savings",
            },
        ]);

        it("gives the income pot every peso the bottom line counts", () => {
            // The pot printed 19,450.82 beside a bottom line of 34,869.53 — two
            // figures for the same money, 15,418.71 apart, on one modal.
            render(
                <MonthBreakdown
                    totals={september}
                    fundingRows={NO_ROWS}
                    monthLabel="September 2026"
                    partnerName="Brenda"
                />,
            );

            const pot = screen.getByText(
                "all but the transfers count toward your budget buckets",
            ).parentElement!;
            expect(within(pot).getByText("$34,869.53")).toBeDefined();
            expect(within(pot).getByText("$19,450.82")).toBeDefined();
            expect(within(pot).getByText("$15,418.71")).toBeDefined();

            const bottom = screen.getByText("Bottom line").parentElement!;
            expect(within(bottom).getByText("$34,869.53")).toBeDefined();
            expect(september.total).toBeCloseTo(34869.53, 2);
        });

        it("gives the other-money pot its legacy transfer too", () => {
            render(
                <MonthBreakdown
                    totals={september}
                    fundingRows={fundingRowsOf(septemberExpenses)}
                    monthLabel="September 2026"
                    partnerName="Brenda"
                />,
            );

            // The savings pot the reconciliation test pins: 11,700 of card spend
            // plus the 1,000 that reached her out of savings — which is a legacy
            // transfer here, and says so in no way the reader has to decode.
            const pot = screen.getByText("outside the budget").parentElement!;
            expect(within(pot).getAllByText("$12,700.00")).toHaveLength(1);
            const amountOf = (label: string) =>
                within(pot).getByText(label).closest("div")!.lastElementChild!
                    .textContent;
            // By who it went to…
            expect(amountOf("Own spending")).toBe("$11,700.00");
            expect(amountOf("Paid to Brenda")).toBe("$1,000.00");
            // …and by which money paid. "From savings" is the expense rows
            // alone — the rail's figure — and its list adds up to it; the
            // legacy transfer has its own row instead of hiding inside it.
            const savings = within(pot).getByText("From savings");
            expect(savings.nextElementSibling!.textContent).toBe("$11,700.00");
            const list = within(savings.closest("details")!).getByRole("list");
            expect(within(list).getByText("$11,700.00")).toBeDefined();
            expect(amountOf("Transfers to Brenda (from savings)")).toBe(
                "$1,000.00",
            );
        });
    });

    it("cuts the charge into the three shares that make it", () => {
        render(
            <MonthBreakdown
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
            />,
        );

        expect(screen.getByText("My income")).toBeDefined();
        expect(screen.getByText("Brenda's share")).toBeDefined();
        // 1000 + 400 + 250, with her 320 inside it. The ring's centre drops the
        // cents so the figure fits the hole; the legend beside it keeps them.
        expect(screen.getByText("$1,650")).toBeDefined();
        expect(screen.queryByText("$1,650.00")).toBeNull();
        expect(screen.getAllByText("$320.00").length).toBeGreaterThan(0);
    });

    it("reports the cash she sent, and never her share beside it", () => {
        // Her 32% is a receivable on MY charges, not money she put in. Printed
        // under "what she put in" it claims a contribution she has not made, and
        // doubles any part of it she has already settled in cash (spec 0007 §6a).
        render(
            <MonthBreakdown
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
            />,
        );

        const section = screen.getByText(
            "Brenda — cash she sent you, this month",
        ).parentElement!;
        expect(within(section).getByText("Brenda paid you")).toBeDefined();
        expect(within(section).getByText("$900.00")).toBeDefined();
        expect(within(section).queryByText("$320.00")).toBeNull();
        expect(screen.queryByText(/what she put in/)).toBeNull();
        expect(screen.queryByText(/still owed/)).toBeNull();
        // Her share keeps its one home: a slice of what I was charged.
        expect(screen.getByText("Brenda's share")).toBeDefined();
        expect(screen.getByText(/belongs to the settlement/)).toBeDefined();
    });

    it("reports what reached her in full, and says it overlaps", () => {
        render(
            <MonthBreakdown
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
            />,
        );

        // 400 payment-expense + 700 legacy transfer, one figure (§6a carve-out).
        expect(screen.getByText("Brenda — what I paid her")).toBeDefined();
        expect(screen.getAllByText("$1,100.00").length).toBeGreaterThan(0);
        expect(
            screen.getByText(/already inside the figures above/),
        ).toBeDefined();
    });

    it("closes with a bottom line whose parts do not overlap", () => {
        render(
            <MonthBreakdown
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
            />,
        );

        const bottom = screen.getByText("Bottom line").parentElement!;
        // spent on myself 680 + sent to her 1,100 (400 + 700) = 1,780 = total.
        expect(within(bottom).getByText("Spent on myself")).toBeDefined();
        expect(within(bottom).getByText("$680.00")).toBeDefined();
        expect(within(bottom).getByText("Sent to Brenda")).toBeDefined();
        expect(within(bottom).getAllByText("$1,100.00")).toHaveLength(1);
        expect(within(bottom).getByText("$1,780.00")).toBeDefined();
        expect(totals.total).toBe(1780);
    });

    describe("a month that set income aside", () => {
        const withSavings = computeFeedTotals([
            ...month,
            expense({
                id: "s1",
                amount: 5000,
                actualExpenditure: 5000,
                category: { slug: "savings" },
            }),
        ]);

        const renderIt = () =>
            render(
                <MonthBreakdown
                    totals={withSavings}
                    fundingRows={NO_ROWS}
                    monthLabel="June 2026"
                    partnerName="Brenda"
                    incomeTotal={20000}
                />,
            );

        it("counts it in the income pot, which the chin also prints", () => {
            // Savings is its own 25% bucket. A pot showing only 1,080 while the
            // chin above it says "Set aside $5,000" makes the two disagree.
            renderIt();

            const pot = screen.getByText(
                "counts toward your budget buckets",
            ).parentElement!;
            expect(within(pot).getByText("$6,080.00")).toBeDefined();
            expect(within(pot).getByText("Spent")).toBeDefined();
            expect(within(pot).getByText("$1,080.00")).toBeDefined();
            expect(within(pot).getByText("Set aside")).toBeDefined();
            expect(within(pot).getByText("$5,000.00")).toBeDefined();
            // The share is of the income that LEFT, not of the spend alone.
            expect(within(pot).getByText("30% of your income")).toBeDefined();
        });

        it("counts it in the bottom line too", () => {
            // Without this row the figures under "out of this month's income" do
            // not add up to the total beside them.
            renderIt();

            const bottom = screen.getByText("Bottom line").parentElement!;
            expect(within(bottom).getByText("Set aside")).toBeDefined();
            expect(
                withSavings.whatIReallySpent.of.spentOnMyself +
                    withSavings.paidToPartner.of.fromIncome.amount +
                    withSavings.setAside,
            ).toBe(withSavings.total);
        });
    });

    it("drops the closing total when it would restate the figure above it", () => {
        // Post-CHORE-12 this is the permanent case: nothing adds to the spend, so
        // the row would print the same number twice in one block.
        const noAddend = computeFeedTotals([
            expense({ id: "e1", amount: 300, actualExpenditure: 300 }),
        ]);
        render(
            <MonthBreakdown
                totals={noAddend}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
            />,
        );

        const bottom = screen.getByText("Bottom line").parentElement!;
        expect(within(bottom).queryByText(/^Total/)).toBeNull();
        expect(within(bottom).getAllByText("$300.00")).toHaveLength(2);
        expect(noAddend.total).toBe(300);
    });

    it("calls the closing total what it is — income, not all money out", () => {
        render(
            <MonthBreakdown
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
            />,
        );

        // 250 of savings-funded spend is on screen two sections above and is NOT
        // in this figure, so "all money out" would be false.
        const bottom = screen.getByText("Bottom line").parentElement!;
        expect(
            within(bottom).getByText("— out of this month's income"),
        ).toBeDefined();
        expect(screen.queryByText(/all money out/)).toBeNull();
    });

    describe("a month holding one income-funded transfer and nothing else", () => {
        // No expenses at all: the pot is real money that left, but none of it is
        // consumption, so every figure derived from consumption is zero.
        const transferOnly = computeFeedTotals(
            [],
            [
                {
                    id: "m1",
                    type: "gf_paid",
                    amount: 700,
                    fundedFrom: "income",
                },
            ],
        );

        const renderIt = () =>
            render(
                <MonthBreakdown
                    totals={transferOnly}
                    fundingRows={NO_ROWS}
                    monthLabel="June 2026"
                    partnerName="Brenda"
                />,
            );

        it("says plainly that none of the pot reaches the budget", () => {
            // "all but the transfers count toward your budget buckets" would be a claim
            // about $0 — and `PotParts` suppresses the itemisation that would
            // have shown it, because one part cannot partition anything.
            renderIt();

            const pot = screen.getByText(
                "none of this counts toward your budget buckets",
            ).parentElement!;
            expect(screen.queryByText(/all but the transfers/)).toBeNull();
            expect(within(pot).getByText("$700.00")).toBeDefined();
            expect(within(pot).queryByText("Spent")).toBeNull();
        });

        it("prints no zero figure in the bottom line", () => {
            renderIt();

            const bottom = screen.getByText("Bottom line").parentElement!;
            expect(
                within(bottom).queryByText("What I really spent"),
            ).toBeNull();
            expect(within(bottom).queryByText("Spent on myself")).toBeNull();
            expect(within(bottom).queryByText("$0.00")).toBeNull();
            // What DID leave is still there — once. A Total over a single row
            // restates it, the same rule `PotParts` applies to an itemisation.
            expect(within(bottom).getByText("Sent to Brenda")).toBeDefined();
            expect(within(bottom).getAllByText("$700.00")).toHaveLength(1);
            expect(within(bottom).queryByText(/^Total/)).toBeNull();
        });

        it("draws no charge donut and no other-money pot", () => {
            renderIt();

            expect(screen.queryByText("What I was charged")).toBeNull();
            expect(screen.queryByText("outside the budget")).toBeNull();
            expect(screen.queryByText("$0.00")).toBeNull();
        });
    });

    it("renders no savings pot and no partner sections for a plain month", () => {
        const plain = computeFeedTotals(
            [expense({ id: "e1", amount: 300, actualExpenditure: 300 })],
            [],
        );
        render(
            <MonthBreakdown
                totals={plain}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
            />,
        );

        // A month with no savings-funded row renders nothing, not a $0.00 card.
        expect(screen.queryByText("Not from this month's income")).toBeNull();
        expect(screen.queryByText(/what she put in/)).toBeNull();
        expect(screen.queryByText(/what I paid her/)).toBeNull();
        expect(screen.queryByText("$0.00")).toBeNull();
    });

    it("renders no income pot for a month funded entirely from savings", () => {
        // The mirror of the plain-month case: the same "an empty pot is not
        // $0.00" rule, on the other card.
        const savingsOnly = computeFeedTotals([
            expense({
                id: "s1",
                amount: 700,
                actualExpenditure: 700,
                fundedFrom: "savings",
                category: { slug: "shopping" },
            }),
        ]);
        render(
            <MonthBreakdown
                totals={savingsOnly}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
                incomeTotal={4000}
            />,
        );

        expect(screen.queryByText("This month's income")).toBeNull();
        expect(
            screen.queryByText("counts toward your budget buckets"),
        ).toBeNull();
        expect(screen.getByText("outside the budget")).toBeDefined();
        expect(screen.queryByText("$0.00")).toBeNull();
    });

    it("keeps a payment-only month readable, without printing one figure twice", () => {
        // Everything he spent went to her, so both figures are the same number.
        // The nesting labels the child instead of special-casing the month.
        const paymentOnly = computeFeedTotals([
            expense({
                id: "p1",
                amount: 500,
                actualExpenditure: 500,
                isPartnerPayment: true,
                category: { slug: "combined-expenses" },
            }),
        ]);
        render(
            <MonthBreakdown
                totals={paymentOnly}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
            />,
        );

        const bottom = screen.getByText("Bottom line").parentElement!;
        // The child names the money, so one $500 never reads as two facts…
        expect(
            within(bottom).getByText("of which sent to Brenda"),
        ).toBeDefined();
        expect(within(bottom).getByText("Sent to Brenda")).toBeDefined();
        // …and the part holding nothing is not drawn as $0.00.
        expect(within(bottom).queryByText("Spent on myself")).toBeNull();
        expect(within(bottom).queryByText("$0.00")).toBeNull();
        expect(paymentOnly.total).toBe(500);
    });

    it("itemises the savings pot when part of it reached her (BUG-5)", () => {
        const withSavingsPayment = computeFeedTotals([
            ...month,
            expense({
                id: "p2",
                amount: 530,
                actualExpenditure: 530,
                isPartnerPayment: true,
                fundedFrom: "savings",
                category: { slug: "combined-expenses" },
            }),
        ]);
        render(
            <MonthBreakdown
                totals={withSavingsPayment}
                fundingRows={NO_ROWS}
                monthLabel="October 2026"
                partnerName="Brenda"
            />,
        );

        // 250 of savings spend and 530 sent to her, inside one $780 pot — never
        // two rows a reader could add to $1,310.
        const pot = screen.getByText("outside the budget").parentElement!;
        expect(within(pot).getAllByText("$780.00")).toHaveLength(2);
        expect(within(pot).getByText("Own spending")).toBeDefined();
        expect(within(pot).getByText("$250.00")).toBeDefined();
        expect(within(pot).getByText("Paid to Brenda")).toBeDefined();
        expect(within(pot).getByText("$530.00")).toBeDefined();
    });

    it("names both halves of a savings pot whose parts are equal", () => {
        // The §6a fixture from feed-dashboard-agreement.test.ts: $680 of savings
        // spend beside a $680 savings-funded transfer. The pot legitimately holds
        // both, so it must SHOW both — a bare $1,360 is what §6a fears.
        const bothHalves = computeFeedTotals(
            [
                expense({
                    id: "f1",
                    amount: 680,
                    actualExpenditure: 680,
                    fundedFrom: "savings",
                    category: { slug: "shopping" },
                }),
            ],
            [
                {
                    id: "m1",
                    type: "gf_paid",
                    amount: 680,
                    fundedFrom: "savings",
                },
            ],
        );
        render(
            <MonthBreakdown
                totals={bothHalves}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
            />,
        );

        const pot = screen.getByText("outside the budget").parentElement!;
        expect(within(pot).getAllByText("$1,360.00")).toHaveLength(1);
        expect(within(pot).getByText("Own spending")).toBeDefined();
        expect(within(pot).getByText("Paid to Brenda")).toBeDefined();
        // Twice per cut: own/paid, then savings purchase/savings transfer.
        expect(within(pot).getByText("From savings")).toBeDefined();
        expect(
            within(pot).getByText("Transfers to Brenda (from savings)"),
        ).toBeDefined();
        expect(within(pot).getAllByText("$680.00")).toHaveLength(4);
        expect(within(pot).getByText("By who it went to")).toBeDefined();
        expect(within(pot).getByText("By which money paid")).toBeDefined();
    });

    it("leaves the pot unitemised when ALL of it reached her (BUG-5's month)", () => {
        // October: two savings-funded payments and nothing else. An itemisation
        // here prints "Own spending $0.00" and a part equal to its own headline.
        const pay = (id: string, amount: number) =>
            expense({
                id,
                amount,
                actualExpenditure: amount,
                isPartnerPayment: true,
                fundedFrom: "savings",
                category: { slug: "combined-expenses" },
            });
        const october = computeFeedTotals([pay("p1", 300), pay("p2", 230)]);
        expect(october.notFromIncome.of.ownSpending).toBe(0);

        render(
            <MonthBreakdown
                totals={october}
                fundingRows={NO_ROWS}
                monthLabel="October 2026"
                partnerName="Brenda"
            />,
        );

        const pot = screen.getByText("outside the budget").parentElement!;
        // The headline and its funding sub-row only — no own/partner itemisation.
        expect(within(pot).getAllByText("$530.00")).toHaveLength(2);
        expect(within(pot).getByText("From savings")).toBeDefined();
        expect(within(pot).queryByText("Own spending")).toBeNull();
        expect(within(pot).queryByText("$0.00")).toBeNull();
    });

    it("draws no itemisation that would not add up to its own headline", () => {
        // The safety cannot rest on the caller passing a complete partition: a
        // part left out would print rows that silently hide the difference.
        render(
            <PotParts
                headline={1000}
                parts={[
                    { label: "Own spending", amount: 600 },
                    { label: "Paid to Brenda", amount: 300 },
                ]}
            />,
        );

        expect(screen.queryByText("Own spending")).toBeNull();
        expect(screen.queryByText("$600.00")).toBeNull();
    });

    it("draws an empty ring rather than dividing by a zero total", () => {
        const nothing = computeFeedTotals([
            expense({
                id: "z1",
                amount: 0,
                actualExpenditure: 0,
                isPartnerPayment: true,
                category: { slug: "combined-expenses" },
            }),
        ]);
        render(
            <Donut
                slices={[
                    {
                        key: "only",
                        label: "Nothing",
                        amount: 0,
                        tone: "plain",
                    },
                ]}
                total={nothing.charged.amount}
                centerCaption="charged"
            />,
        );

        expect(screen.getAllByText("$0.00").length).toBeGreaterThan(0);
    });

    it("drops the income share when the month has no income logged", () => {
        render(
            <MonthBreakdown
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
                incomeTotal={0}
            />,
        );

        expect(screen.queryByText(/of your .* income/)).toBeNull();
    });

    it("draws no income remainder for a month with neither income nor spend logged (R4-2)", () => {
        const empty = computeFeedTotals([]);
        render(
            <MonthBreakdown
                totals={empty}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
                incomeTotal={0}
            />,
        );

        expect(screen.queryByText(/left$/)).toBeNull();
        expect(screen.queryByText(/over income/)).toBeNull();
    });

    it("reads spend against no logged income as over income (R4-2)", () => {
        render(
            <MonthBreakdown
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
                incomeTotal={0}
            />,
        );

        expect(screen.getByText("$1,780.00 over income").className).toContain(
            "text-danger",
        );
    });

    it("reads a float sum a hair below income as exactly spent, not over (R4-N1)", () => {
        // 0.1 + 0.2 sums to 0.30000000000000004 in IEEE 754 — a real artifact,
        // not a contrived number. Comparing in cents must swallow it.
        const floatMonth = computeFeedTotals([
            expense({ id: "f1", amount: 0.1, actualExpenditure: 0.1 }),
            expense({ id: "f2", amount: 0.2, actualExpenditure: 0.2 }),
        ]);
        render(
            <MonthBreakdown
                totals={floatMonth}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Brenda"
                incomeTotal={0.3}
            />,
        );

        expect(screen.getByText("$0.00 left").className).toContain(
            "text-positive",
        );
        expect(screen.queryByText(/over income/)).toBeNull();
    });
});

describe("the chin that opens it", () => {
    it("opens the breakdown from the dashboard rail", async () => {
        render(
            <SummaryRail
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Avery"
                sharesExpenses
                isCurrentMonth
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Full breakdown" }));

        expect(await screen.findByText("June 2026 breakdown")).toBeDefined();
        expect(screen.getByText("Which pot it came from")).toBeDefined();
    });

    it("shows the partner cash as two named flows and no net", () => {
        render(
            <SummaryRail
                totals={totals}
                fundingRows={NO_ROWS}
                monthLabel="June 2026"
                partnerName="Avery"
                sharesExpenses
                isCurrentMonth
            />,
        );
        const chin = within(screen.getByTestId("feed-totals"));
        // 400 payment-expense + 700 transfer out; 900 back from her.
        expect(
            chin.getByRole("listitem", { name: "You sent Avery $1,100.00" }),
        ).toBeDefined();
        expect(
            chin.getByRole("listitem", { name: "Avery sent you $900.00" }),
        ).toBeDefined();
        expect(chin.queryByText("$200.00")).toBeNull();
        expect(chin.queryByText("Of that, from savings")).toBeNull();
        expect(
            chin.getByText("From savings").nextElementSibling?.textContent,
        ).toBe("$250.00");
    });
});

describe("the figures the rail leaves to Full breakdown", () => {
    // Invented month holding every figure the rail used to print: a refund, a
    // savings allocation, a savings-funded transfer, and income left over.
    const rows = [
        expense({ id: "e1", amount: 1000, actualExpenditure: 680 }),
        expense({
            id: "e2",
            amount: 300,
            actualExpenditure: 300,
            fundedFrom: "savings",
            category: { slug: "shopping" },
        }),
        expense({
            id: "e3",
            amount: 450,
            actualExpenditure: 450,
            fundedFrom: "reimbursed",
            category: { slug: "health" },
        }),
        expense({
            id: "e4",
            amount: 500,
            actualExpenditure: 500,
            category: { slug: "savings" },
        }),
    ];
    const moved = computeFeedTotals(rows, [
        { id: "m1", type: "gf_paid", amount: 700, fundedFrom: "income" },
        { id: "m2", type: "gf_paid", amount: 250, fundedFrom: "savings" },
    ]);
    const props = {
        totals: moved,
        fundingRows: fundingRowsOf(rows),
        monthLabel: "June 2026",
        partnerName: "Avery",
        sharesExpenses: true,
        isCurrentMonth: true,
        incomeTotal: 3000,
    };

    it("holds the invented shapes", () => {
        expect(moved.total).toBe(1880);
        expect(moved.setAside).toBe(500);
        expect(moved.notFromIncome.reimbursed.amount).toBe(450);
        expect(moved.paidToPartner.of.notFromIncome.amount).toBe(250);
    });

    it("drops them from the rail", () => {
        render(<SummaryRail {...props} />);
        const chin = within(screen.getByTestId("feed-totals"));

        for (const gone of [
            "Reimbursed",
            "Set aside to savings",
            "Total — out of this month's income",
            "Of that, from savings",
            "$1,880.00",
            "$1,120.00 left",
        ]) {
            expect(chin.queryByText(gone)).toBeNull();
        }
        expect(chin.queryByRole("list", { name: /expenses/ })).toBeNull();
    });

    it("keeps every one of them in the modal", async () => {
        render(<SummaryRail {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "Full breakdown" }));
        const modal = within(await screen.findByRole("dialog"));

        // Reimbursed, with the rows behind it and behind From savings.
        const pot = modal.getByText("outside the budget").parentElement!;
        expect(
            within(pot).getByText("Reimbursed").closest("summary")!
                .lastElementChild?.textContent,
        ).toBe("$450.00");
        expect(
            within(pot).getByRole("list", { name: "Reimbursed expenses" }),
        ).toBeDefined();
        expect(
            within(pot).getByRole("list", { name: "From savings expenses" }),
        ).toBeDefined();
        // Set aside, and the total out of this month's income.
        const incomePot = modal.getByText(
            "all but the transfers count toward your budget buckets",
        ).parentElement!;
        expect(within(incomePot).getByText("$1,880.00")).toBeDefined();
        expect(within(incomePot).getByText("Set aside")).toBeDefined();
        expect(modal.getByText("— out of this month's income")).toBeDefined();
        // Income and what is left of it.
        expect(modal.getByText("$3,000.00")).toBeDefined();
        expect(modal.getByText("$1,120.00 left").className).toContain(
            "text-positive",
        );
        // "Of that, from savings": the savings slice of what I paid her.
        const paid = within(
            modal.getByText("Avery — what I paid her").closest("section")!,
        );
        expect(
            paid.getByText("Not from this month's income").nextElementSibling
                ?.textContent,
        ).toBe("$250.00");
    });

    it("says when the month spent more than its income", async () => {
        render(<SummaryRail {...props} incomeTotal={1000} />);
        fireEvent.click(screen.getByRole("button", { name: "Full breakdown" }));
        const modal = within(await screen.findByRole("dialog"));
        expect(modal.getByText("$880.00 over income").className).toContain(
            "text-danger",
        );
    });
});

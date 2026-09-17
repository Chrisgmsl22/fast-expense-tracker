import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { MonthFeed } from "@/components/dashboard/MonthFeed";
import { PARTNER_PAYMENT_SUBCATEGORY_NAME } from "@/lib/domain/expense";
import type { CoupleBalance } from "@/lib/domain/settlement";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";
import type { MovementListItem } from "@/lib/repositories/movement.repository";

const sheOwes: CoupleBalance = {
    balance: 500,
    amount: 500,
    direction: "she_owes",
    breakdown: [],
};

// Money sent to the partner is an EXPENSE now (spec 0007 §6b), so the footer
// figure and the row both come from this one row.
const partnerPayment: ExpenseListItem = {
    id: "ePay",
    date: new Date("2026-06-22T06:00:00Z"),
    description: "Settled up",
    amount: 200,
    actualExpenditure: 200,
    fundedFrom: "income" as const,
    isShared: false,
    isPartnerPayment: true,
    cycleClosedAt: null,
    category: {
        id: "c9",
        slug: "combined-expenses",
        name: "Combined Expenses",
        color: "#d97706",
    },
    subcategory: { name: PARTNER_PAYMENT_SUBCATEGORY_NAME },
    card: null,
};

const expenses: ExpenseListItem[] = [
    {
        id: "e1",
        date: new Date("2026-06-18T06:00:00Z"),
        description: "Soriana",
        amount: 1820,
        actualExpenditure: 1237,
        fundedFrom: "income" as const,
        isShared: true,
        isPartnerPayment: false,
        cycleClosedAt: null,
        category: {
            id: "c1",
            slug: "groceries",
            name: "Groceries",
            color: "#65a30d",
        },
        subcategory: null,
        card: { name: "BBVA", color: "#2563eb" },
    },
    {
        id: "e2",
        date: new Date("2026-06-20T06:00:00Z"),
        description: "Uber",
        amount: 185,
        actualExpenditure: 185,
        fundedFrom: "income" as const,
        isShared: false,
        isPartnerPayment: false,
        cycleClosedAt: null,
        category: {
            id: "c2",
            slug: "transport",
            name: "Transport",
            color: "#7c3aed",
        },
        subcategory: null,
        card: null,
    },
];

/** A thing the partner fronted that he owes back — never a cash outflow. */
const debt: MovementListItem = {
    id: "d1",
    date: new Date("2026-06-19T06:00:00Z"),
    amount: 1500,
    type: "gf_fronted",
    card: null,
    note: "she covered the vet",
    fundedFrom: "income",
    closedAt: null,
    cycleClosedAt: null,
};

describe("MonthFeed", () => {
    it("lists the month's expenses with share subtext and card fallback", () => {
        render(
            <MonthFeed
                expenses={expenses}
                movements={[]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        expect(screen.getByText("Soriana")).toBeDefined();
        expect(screen.getByText("share $1,237.00")).toBeDefined();
        // Null card falls back to Cash; non-shared shows "solo".
        expect(screen.getByText(/Cash/)).toBeDefined();
        expect(screen.getByText("solo")).toBeDefined();
    });

    it("labels a partner payment, never Cash", () => {
        // A payment has no card; the bare `?? "Cash"` fallback is BUG-1's symptom.
        render(
            <MonthFeed
                expenses={[
                    {
                        ...expenses[0]!,
                        id: "payment",
                        description: "Sushi",
                        card: null,
                        isShared: false,
                        isPartnerPayment: true,
                    },
                ]}
                movements={[]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );

        // The label sits beside a colour dot in the same line, so match the
        // text node rather than the whole element.
        expect(screen.getByText(/Paid Brenda/)).toBeDefined();
        expect(screen.queryByText(/\bCash\b/)).toBeNull();
    });

    it("totals Charged + What I really spent in the footer", () => {
        render(
            <MonthFeed
                expenses={expenses}
                movements={[]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        // charged = 1820 + 185 = 2005; spent = 1237 + 185 = 1422
        expect(screen.getByText("$2,005.00")).toBeDefined();
        expect(screen.getByText("What I really spent")).toBeDefined();
        expect(screen.getByText("$1,422.00")).toBeDefined();
    });

    it("shows an empty state and no footer with nothing logged", () => {
        render(
            <MonthFeed
                expenses={[]}
                movements={[]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        expect(
            screen.getByText(/nothing logged this month yet/i),
        ).toBeDefined();
        expect(screen.queryByText("Charged")).toBeNull();
    });

    it("labels a gf_received movement as 'Brenda paid you', not 'Paid Brenda'", () => {
        const received: MovementListItem[] = [
            {
                id: "m1",
                date: new Date("2026-06-15T06:00:00Z"),
                amount: 700,
                type: "gf_received",
                card: null,
                note: null,
                fundedFrom: "income",
                closedAt: null,
                cycleClosedAt: null,
            },
        ];
        render(
            <MonthFeed
                expenses={[]}
                movements={received}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        // The row and the footer line share the wording, so scope to the list.
        expect(screen.getAllByText("Brenda paid you")).toHaveLength(2);
        expect(screen.queryByText("Paid Brenda")).toBeNull();
        const totals = within(screen.getByTestId("feed-totals"));
        expect(totals.getByText("Brenda paid you")).toBeDefined();
        expect(totals.getByText("$700.00")).toBeDefined();
    });

    it("splits the footer into Charged / spent / Set aside / Total when savings is present", () => {
        const mixed: ExpenseListItem[] = [
            {
                id: "g1",
                date: new Date("2026-06-05T06:00:00Z"),
                description: "Groceries",
                amount: 1000,
                actualExpenditure: 680,
                fundedFrom: "income" as const,
                isShared: true,
                isPartnerPayment: false,
                cycleClosedAt: null,
                category: {
                    id: "cg",
                    slug: "groceries",
                    name: "Groceries",
                    color: "#65a30d",
                },
                subcategory: null,
                card: { name: "BBVA", color: "#2563eb" },
            },
            {
                id: "s1",
                date: new Date("2026-06-02T06:00:00Z"),
                description: "Emergency fund",
                amount: 5000,
                actualExpenditure: 5000,
                fundedFrom: "income" as const,
                isShared: false,
                isPartnerPayment: false,
                cycleClosedAt: null,
                category: {
                    id: "cs",
                    slug: "savings",
                    name: "Savings",
                    color: "#0d9488",
                },
                subcategory: null,
                card: null,
            },
        ];
        render(
            <MonthFeed
                expenses={mixed}
                movements={[]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        const totals = within(screen.getByTestId("feed-totals"));
        expect(totals.getByText("Charged")).toBeDefined();
        expect(totals.getByText("$1,000.00")).toBeDefined();
        expect(totals.getByText("What I really spent")).toBeDefined();
        expect(totals.getByText("$680.00")).toBeDefined();
        expect(totals.getByText("Set aside")).toBeDefined();
        expect(totals.getByText("$5,000.00")).toBeDefined();
        expect(totals.getByText("Total")).toBeDefined();
        expect(totals.getByText("$5,680.00")).toBeDefined();
    });

    it("omits Set aside / Total when there's no savings or transfer", () => {
        render(
            <MonthFeed
                expenses={expenses}
                movements={[]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        expect(screen.queryByText("Set aside")).toBeNull();
        expect(screen.queryByText("Total")).toBeNull();
    });

    it("renders money movements and folds transfers into the footer", () => {
        const movements: MovementListItem[] = [
            {
                id: "m1",
                date: new Date("2026-06-21T06:00:00Z"),
                amount: 500,
                type: "card_payment",
                card: { name: "BBVA", color: "#2563eb" },
                note: null,
                fundedFrom: "income",
                closedAt: null,
                cycleClosedAt: null,
            },
        ];
        render(
            <MonthFeed
                expenses={[...expenses, partnerPayment]}
                movements={movements}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        // Card payment line present (no partner-money tag anymore).
        expect(screen.getByText("Card payment")).toBeDefined();
        // Transfer line + footer "Paid to Brenda" figure.
        expect(screen.getAllByText(/Paid Brenda/)[0]).toBeDefined();
        const totals = within(screen.getByTestId("feed-totals"));
        // The payment is a breakdown of what I really spent, so it reads as one.
        expect(totals.getByText("of which paid to Brenda")).toBeDefined();
        expect(totals.getByText("$200.00")).toBeDefined();
    });

    it("keeps a savings-funded transfer out of the budget figures but badged in the list", () => {
        // Spec 0007 §6a decision 5: it used no part of this month's income, so
        // it leaves the cash figures — while staying visible as a row, and
        // still counting in full toward the settlement balance elsewhere.
        const movements: MovementListItem[] = [
            {
                id: "m1",
                date: new Date("2026-06-22T06:00:00Z"),
                amount: 8000,
                type: "gf_paid",
                card: null,
                note: "settled from savings",
                fundedFrom: "savings",
                closedAt: null,
                cycleClosedAt: null,
            },
            {
                id: "m2",
                date: new Date("2026-06-23T06:00:00Z"),
                amount: 200,
                type: "gf_paid",
                card: null,
                note: "netted week",
                fundedFrom: "income",
                closedAt: null,
                cycleClosedAt: null,
            },
        ];
        render(
            <MonthFeed
                expenses={expenses}
                movements={movements}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );

        expect(screen.getByText("from savings")).toBeDefined();
        const totals = within(screen.getByTestId("feed-totals"));
        // Only the income-funded 200 reaches the figure the Total adds.
        expect(totals.getByText("Transfers to Brenda")).toBeDefined();
        expect(totals.getByText("$200.00")).toBeDefined();
        expect(totals.queryByText("$8,200.00")).toBeNull();
        // The excluded money is surfaced under its OWN cash line, named for the
        // partner — never merged into the consumption line (spec 0007 §6a).
        expect(
            totals.getByText("Transfers to Brenda (not from income)"),
        ).toBeDefined();
        expect(totals.getByText("$8,000.00")).toBeDefined();
        expect(totals.queryByText("Not from this month's income")).toBeNull();
    });

    it("badges no ordinary row — income money is never 'not from income'", () => {
        // `FundingBadge` cannot represent `income`, so a dropped guard is a type
        // error first; this is the behavioural half. Without either, every
        // ordinary row grows a false "not from income" chip.
        render(
            <MonthFeed
                expenses={expenses}
                movements={[
                    {
                        id: "m1",
                        date: new Date("2026-06-22T06:00:00Z"),
                        amount: 200,
                        type: "gf_paid",
                        card: null,
                        note: "netted week",
                        fundedFrom: "income",
                        closedAt: null,
                        cycleClosedAt: null,
                    },
                ]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        // Both rows really are on screen, so this isn't a vacuous pass.
        expect(screen.getByText("Soriana")).toBeDefined();
        expect(screen.getByText("Paid Brenda")).toBeDefined();
        // …and neither carries any of the three badge wordings. `queryAll` so
        // two bad rows read as two, not as a "multiple elements" crash.
        expect(screen.queryAllByText("not from income")).toHaveLength(0);
        expect(screen.queryAllByText("from savings")).toHaveLength(0);
        expect(screen.queryAllByText("reimbursed")).toHaveLength(0);
    });

    it("prints the consumption and cash exclusions as two lines, never one sum", () => {
        // The §6a flow: a $680 dinner she fronted (consumption, savings-funded)
        // and the $680 transfer settling it (cash, savings-funded). One line
        // reading $1,360 would bill the same dinner twice.
        render(
            <MonthFeed
                expenses={[
                    {
                        ...expenses[0]!,
                        id: "fronted",
                        description: "Dinner she fronted",
                        amount: 680,
                        actualExpenditure: 680,
                        fundedFrom: "savings",
                    },
                ]}
                movements={[
                    {
                        id: "m1",
                        date: new Date("2026-06-22T06:00:00Z"),
                        amount: 680,
                        type: "gf_paid",
                        card: null,
                        note: "settling the dinner",
                        fundedFrom: "savings",
                        closedAt: null,
                        cycleClosedAt: null,
                    },
                ]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );

        const totals = within(screen.getByTestId("feed-totals"));
        expect(totals.getByText("Not from this month's income")).toBeDefined();
        expect(
            totals.getByText("Transfers to Brenda (not from income)"),
        ).toBeDefined();
        // Three times $680, never once $1,360: Charged (source-agnostic), the
        // consumption exclusion, and the cash exclusion. Each is one ledger's
        // view of the money; no line adds two of them together.
        expect(totals.getAllByText("$680.00")).toHaveLength(3);
        expect(totals.queryByText("$1,360.00")).toBeNull();
    });

    it("names a savings-funded PAYMENT on the same line as a transfer (BUG-5)", () => {
        // Before the fix the two $265 payments printed no line at all: only a
        // legacy movement reached the figure the footer read.
        const pay = (id: string, amount: number): ExpenseListItem => ({
            ...partnerPayment,
            id,
            amount,
            actualExpenditure: amount,
            fundedFrom: "savings",
        });
        render(
            <MonthFeed
                expenses={[pay("p1", 300), pay("p2", 230)]}
                movements={[]}
                monthLabel="October 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );

        const totals = within(screen.getByTestId("feed-totals"));
        // Nested in the DOM, not merely adjacent: the child renders INSIDE its
        // parent's container, so a flatten-to-siblings regression fails here.
        const parent = totals.getByTestId("summary-line-not-from-income");
        expect(
            within(parent).getByText("Not from this month's income"),
        ).toBeDefined();
        const child = within(parent).getByText("of which paid to Brenda");
        expect(within(child.parentElement!).getByText("$530.00")).toBeDefined();
        // A breakdown only: nothing income-funded happened this month.
        expect(totals.queryByText("Transfers to Brenda")).toBeNull();
    });

    it("omits the savings line when no money reached her that way", () => {
        render(
            <MonthFeed
                expenses={expenses}
                movements={[]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );

        const totals = within(screen.getByTestId("feed-totals"));
        expect(totals.queryByText("of which paid to Brenda")).toBeNull();
    });

    it("keeps the reminder, and its scope, on an empty month", () => {
        // The empty branch renders no chin, and it is the branch a past month is
        // most likely to hit — the one place the caption was still missing.
        render(
            <MonthFeed
                expenses={[]}
                movements={[]}
                monthLabel="March 2026"
                settlement={sheOwes}
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth={false}
            />,
        );

        expect(screen.getByRole("link").getAttribute("href")).toBe(
            "/settlement",
        );
        expect(screen.getByText("Brenda owes you")).toBeDefined();
        expect(
            screen.getByText("The open settlement — not March 2026."),
        ).toBeDefined();
    });

    it("says the balance is the open cycle when another month is on screen", () => {
        // The rail's own figures are the viewed month and the dashboard carries a
        // month picker, so an unqualified chip reads as that month's debt.
        render(
            <MonthFeed
                expenses={expenses}
                movements={[]}
                monthLabel="March 2026"
                settlement={sheOwes}
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth={false}
            />,
        );

        expect(
            screen.getByText("The open settlement — not March 2026."),
        ).toBeDefined();
    });

    it("renders the settlement chip in Shared mode when a balance is passed", () => {
        render(
            <MonthFeed
                expenses={expenses}
                movements={[]}
                monthLabel="June 2026"
                settlement={sheOwes}
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        // The chip is a link to the settlement page.
        expect(screen.getByRole("link").getAttribute("href")).toBe(
            "/settlement",
        );
    });

    it("keeps historical partner rows + 'Paid to' total but hides only the settlement chip in Solo mode (CHORE-6.b, Option 2)", () => {
        const movements: MovementListItem[] = [
            {
                id: "m1",
                date: new Date("2026-06-21T06:00:00Z"),
                amount: 500,
                type: "card_payment",
                card: { name: "BBVA", color: "#2563eb" },
                note: null,
                fundedFrom: "income",
                closedAt: null,
                cycleClosedAt: null,
            },
        ];
        render(
            <MonthFeed
                expenses={[...expenses, partnerPayment]}
                movements={movements}
                monthLabel="June 2026"
                settlement={sheOwes}
                partnerName="Brenda"
                sharesExpenses={false}
                isCurrentMonth
            />,
        );
        // Non-partner activity stays.
        expect(screen.getByText("Card payment")).toBeDefined();
        // Historical partner data stays visible (immutable history, ADR-0021):
        // the transfer row + the monthly "Paid to Brenda" footer figure.
        expect(screen.getAllByText(/Paid Brenda/)[0]).toBeDefined();
        const totals = within(screen.getByTestId("feed-totals"));
        expect(totals.getByText("of which paid to Brenda")).toBeDefined();
        expect(totals.getByText("$200.00")).toBeDefined();
        // Only the settlement chip (its link) is hidden on the dashboard — the
        // running balance stays live and settleable via /settlement (ADR-0021,
        // decision 8; nothing is frozen).
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("never shows a debt she fronted, even when handed one", () => {
        // Settlement-only (spec 0007 §6b): the month query excludes it and `buildFeed`
        // drops it again.
        render(
            <MonthFeed
                expenses={expenses}
                movements={[debt]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        expect(screen.queryByText("she covered the vet")).toBeNull();
        expect(screen.queryByText(/I owe Brenda/)).toBeNull();
    });

    it("changes no footer total when a debt is present (no cash moved)", () => {
        // A debt reaches NO ledger (spec 0007 §6b), so adding one must not move a
        // figure. Both renders carry the same expenses; only the debt differs.
        const movements: MovementListItem[] = [];
        const { unmount } = render(
            <MonthFeed
                expenses={expenses}
                movements={movements}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        const without = screen.getByTestId("feed-totals").textContent;
        unmount();

        render(
            <MonthFeed
                expenses={expenses}
                movements={[...movements, debt]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        // Charged / What I really spent / Set aside / Paid to Brenda / Total —
        // every figure identical (ADR-0020).
        expect(screen.getByTestId("feed-totals").textContent).toBe(without);
        // …and the debt is not on screen at all: it reaches no ledger AND no
        // feed (spec 0007 §6b).
        expect(screen.queryByText("she covered the vet")).toBeNull();
    });

    it("shows no card (not Cash) for a savings row", () => {
        const savings: ExpenseListItem[] = [
            {
                id: "s1",
                date: new Date("2026-06-02T06:00:00Z"),
                description: "Emergency fund",
                amount: 5000,
                actualExpenditure: 5000,
                fundedFrom: "income" as const,
                isShared: false,
                isPartnerPayment: false,
                cycleClosedAt: null,
                category: {
                    id: "cs",
                    slug: "savings",
                    name: "Savings",
                    color: "#0d9488",
                },
                subcategory: null,
                card: null,
            },
        ];
        render(
            <MonthFeed
                expenses={savings}
                movements={[]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        expect(screen.getByText("Emergency fund")).toBeDefined();
        expect(screen.queryByText(/Cash/)).toBeNull();
    });
});

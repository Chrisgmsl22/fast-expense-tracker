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
        expect(screen.getByText("$2,005.00 charged")).toBeDefined();
        expect(screen.getByText("What June 2026 cost me")).toBeDefined();
        expect(screen.getAllByText("$1,422.00")[0]).toBeDefined();
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
        expect(screen.getByText("Brenda paid you")).toBeDefined();
        expect(screen.queryByText("Paid Brenda")).toBeNull();
        const totals = within(screen.getByTestId("feed-totals"));
        expect(
            totals.getByRole("listitem", { name: "Brenda sent you $700.00" }),
        ).toBeDefined();
    });

    it("shows the cost, a Saved pill, and no income total when savings is present", () => {
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
        expect(totals.getByText("$1,000.00 charged")).toBeDefined();
        expect(
            totals.getByText("From this month's income").nextElementSibling
                ?.textContent,
        ).toBe("$680.00");
        expect(totals.getByText("Saved").nextElementSibling?.textContent).toBe(
            "$5,000.00",
        );
        // The income total lives in Full breakdown now.
        expect(
            totals.queryByText("Total — out of this month's income"),
        ).toBeNull();
        expect(totals.queryByText("$5,680.00")).toBeNull();
    });

    it("draws no Saved pill for a month that set nothing aside", () => {
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
        const footer = within(screen.getByTestId("feed-totals"));
        expect(footer.queryByText("Saved")).toBeNull();
        expect(
            footer.getByText("From this month's income").nextElementSibling
                ?.textContent,
        ).toBe("$1,422.00");
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
        // Transfer line + the "sent" flow in the partner pill.
        expect(screen.getAllByText(/Paid Brenda/)[0]).toBeDefined();
        const totals = within(screen.getByTestId("feed-totals"));
        expect(
            totals.getByRole("listitem", { name: "You sent Brenda $200.00" }),
        ).toBeDefined();
    });

    it("shows both transfer sources as partner details without changing income cost", () => {
        const base: MovementListItem = {
            ...debt,
            type: "gf_paid",
            id: "legacy",
            amount: 8000,
            fundedFrom: "savings",
        };
        render(
            <MonthFeed
                expenses={expenses}
                movements={[
                    base,
                    {
                        ...base,
                        id: "income",
                        amount: 200,
                        fundedFrom: "income",
                    },
                ]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        const footer = within(screen.getByTestId("feed-totals"));
        expect(
            footer.getByRole("listitem", { name: "You sent Brenda $8,200.00" }),
        ).toBeDefined();
        // Its savings slice moved to Full breakdown with the income total.
        expect(footer.queryByText("Of that, from savings")).toBeNull();
        expect(
            footer.getByText("From this month's income").nextElementSibling
                ?.textContent,
        ).toBe("$1,422.00");
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

    it("keeps outside-income consumption separate from legacy transfer details", () => {
        const expense = {
            ...expenses[0]!,
            amount: 680,
            actualExpenditure: 680,
            fundedFrom: "savings" as const,
        };
        const movement: MovementListItem = {
            ...debt,
            type: "gf_paid",
            amount: 680,
            fundedFrom: "savings",
        };
        render(
            <MonthFeed
                expenses={[expense]}
                movements={[movement]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        const footer = within(screen.getByTestId("feed-totals"));
        expect(
            footer.getByText("From savings").nextElementSibling?.textContent,
        ).toBe("$680.00");
        expect(
            footer.getByRole("listitem", { name: "You sent Brenda $680.00" }),
        ).toBeDefined();
        expect(footer.queryByText("$1,360.00")).toBeNull();
    });

    it("keeps outside-income payments within partner details", () => {
        const pay = {
            ...partnerPayment,
            amount: 530,
            actualExpenditure: 530,
            fundedFrom: "savings" as const,
        };
        render(
            <MonthFeed
                expenses={[pay]}
                movements={[]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
                isCurrentMonth
            />,
        );
        const footer = within(screen.getByTestId("feed-totals"));
        expect(
            footer.getByText("From savings").nextElementSibling?.textContent,
        ).toBe("$530.00");
        expect(
            footer.getByRole("listitem", { name: "You sent Brenda $530.00" }),
        ).toBeDefined();
        expect(footer.queryByText("Of that, from savings")).toBeNull();
    });

    it("shows $0 sent when no money reached her", () => {
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
        expect(
            totals.getByRole("listitem", { name: "You sent Brenda $0.00" }),
        ).toBeDefined();
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
        // the transfer row + the "sent" flow in the partner pill.
        expect(screen.getAllByText(/Paid Brenda/)[0]).toBeDefined();
        const totals = within(screen.getByTestId("feed-totals"));
        expect(
            totals.getByRole("listitem", { name: "You sent Brenda $200.00" }),
        ).toBeDefined();
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
        // Every figure on the rail identical (ADR-0020).
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

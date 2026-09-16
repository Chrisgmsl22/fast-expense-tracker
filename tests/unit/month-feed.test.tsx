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
            />,
        );
        expect(screen.getByText("Soriana")).toBeDefined();
        expect(screen.getByText("share $1,237.00")).toBeDefined();
        // Null card falls back to Cash; non-shared shows "solo".
        expect(screen.getByText(/Cash/)).toBeDefined();
        expect(screen.getByText("solo")).toBeDefined();
    });

    it("labels a partner payment, never Cash", () => {
        // The row has no card because a transfer leaves a bank account, not a
        // card. Falling back to the word Cash — as a bare `?? "Cash"` does —
        // puts the BUG-1 symptom back on screen even though the totals are right.
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
            />,
        );
        expect(screen.getByText("Brenda paid you")).toBeDefined();
        expect(screen.queryByText("Paid Brenda")).toBeNull();
    });

    it("splits the footer into Charged / spent / Set aside / Total when savings is present", () => {
        const mixed: ExpenseListItem[] = [
            {
                id: "g1",
                date: new Date("2026-06-05T06:00:00Z"),
                description: "Groceries",
                amount: 1000,
                actualExpenditure: 680,
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
            />,
        );
        // Card payment line present (no partner-money tag anymore).
        expect(screen.getByText("Card payment")).toBeDefined();
        // Transfer line + footer "Paid to Brenda" figure.
        expect(screen.getAllByText(/Paid Brenda/)[0]).toBeDefined();
        const totals = within(screen.getByTestId("feed-totals"));
        expect(totals.getByText("Paid to Brenda")).toBeDefined();
        expect(totals.getByText("$200.00")).toBeDefined();
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
            />,
        );
        // Non-partner activity stays.
        expect(screen.getByText("Card payment")).toBeDefined();
        // Historical partner data stays visible (immutable history, ADR-0021):
        // the transfer row + the monthly "Paid to Brenda" footer figure.
        expect(screen.getAllByText(/Paid Brenda/)[0]).toBeDefined();
        const totals = within(screen.getByTestId("feed-totals"));
        expect(totals.getByText("Paid to Brenda")).toBeDefined();
        expect(totals.getByText("$200.00")).toBeDefined();
        // Only the settlement chip (its link) is hidden on the dashboard — the
        // running balance stays live and settleable via /settlement (ADR-0021,
        // decision 8; nothing is frozen).
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("never shows a debt she fronted, even when handed one", () => {
        // Settlement-only (spec 0007 §6b): a debt is provisional and may shrink
        // or vanish before money moves, so it must not sit beside real
        // spending. The month query excludes it and `buildFeed` drops it again,
        // so a caller assembling its own list cannot put the orange row back.
        render(
            <MonthFeed
                expenses={expenses}
                movements={[debt]}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
            />,
        );
        expect(screen.queryByText("she covered the vet")).toBeNull();
        expect(screen.queryByText(/I owe Brenda/)).toBeNull();
    });

    it("changes no footer total when a debt is present (no cash moved)", () => {
        // A debt reaches NO ledger (spec 0007 §6b), so adding one must not move
        // a single figure. Both renders carry the same expenses; only the debt
        // differs.
        const movements: MovementListItem[] = [];
        const { unmount } = render(
            <MonthFeed
                expenses={expenses}
                movements={movements}
                monthLabel="June 2026"
                partnerName="Brenda"
                sharesExpenses
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
            />,
        );
        expect(screen.getByText("Emergency fund")).toBeDefined();
        expect(screen.queryByText(/Cash/)).toBeNull();
    });
});

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { StatStrip } from "@/components/dashboard/StatStrip";
import { FundingPart } from "@/components/money/FundingSplit";
import { MonthBreakdown } from "@/components/money/MonthBreakdown";
import { SummaryRail } from "@/components/money/SummaryRail";
import { SummaryStrip } from "@/components/money/SummaryStrip";
import {
    computeFeedTotals,
    type FeedTotalMovement,
} from "@/lib/domain/movement";
import { funded, fundingRowsOf } from "@/tests/support/funding-rows";

/**
 * Invented month, built to catch a parent whose visible parts do not add up:
 * income spend, savings own spend, a savings payment to the partner, a refunded
 * visit, AND a legacy savings-funded `gf_paid` with no expense row behind it —
 * the row that made "From savings" mean two things (R1-2).
 */
const expenses = [
    funded({
        id: "i1",
        amount: 1000,
        actualExpenditure: 680,
        isPartnerPayment: false,
        category: { slug: "groceries" },
        fundedFrom: "income",
        description: "Market run",
    }),
    funded({
        id: "s1",
        amount: 4758,
        actualExpenditure: 4758,
        isPartnerPayment: false,
        category: { slug: "shopping" },
        fundedFrom: "savings",
        description: "New laptop",
    }),
    funded({
        id: "s2",
        amount: 530,
        actualExpenditure: 530,
        isPartnerPayment: true,
        category: { slug: "combined-expenses" },
        fundedFrom: "savings",
        description: "Paid Avery",
    }),
    funded({
        id: "r1",
        amount: 3500,
        actualExpenditure: 3500,
        isPartnerPayment: false,
        category: { slug: "health" },
        fundedFrom: "reimbursed",
        description: "Clinic visit",
    }),
];
const movements: FeedTotalMovement[] = [
    { id: "m1", type: "gf_paid", amount: 1000, fundedFrom: "savings" },
];
const totals = computeFeedTotals(expenses, movements);
const fundingRows = fundingRowsOf(expenses);

const shared = {
    totals,
    fundingRows,
    monthLabel: "October 2026",
    partnerName: "Avery",
    sharesExpenses: true,
    isCurrentMonth: true,
};

/** "$5,968.00" → 5968. */
function money(el: Element | null | undefined): number {
    const match = (el?.textContent ?? "").match(/\$([\d,]+\.\d{2})/);
    expect(match).not.toBeNull();
    return Number(match![1]!.replace(/,/g, ""));
}

/** A funding sub-row's figure: the last cell of its summary. */
function partAmount(scope: HTMLElement, label: string): number {
    return money(
        within(scope).getByText(label).closest("summary")!.lastElementChild,
    );
}

/** A funding sub-row's list, summed row by row (last cell = amount). */
function listSum(scope: HTMLElement, label: string): number {
    const details = within(scope).getByText(label).closest("details")!;
    const rows = within(within(details).getByRole("list")).getAllByRole(
        "listitem",
    );
    return rows.reduce((sum, row) => sum + money(row.lastElementChild), 0);
}

function expectListsAddUp(scope: HTMLElement) {
    expect(listSum(scope, "From savings")).toBeCloseTo(
        partAmount(scope, "From savings"),
        2,
    );
    expect(listSum(scope, "Reimbursed")).toBeCloseTo(
        partAmount(scope, "Reimbursed"),
        2,
    );
}

describe("the fixture", () => {
    it("holds every shape the surfaces must add up", () => {
        expect(totals.notFromIncome.fromSavings.amount).toBe(5288);
        expect(totals.notFromIncome.reimbursed.amount).toBe(3500);
        expect(
            totals.paidToPartner.of.notFromIncome.of.fromLegacyTransfers,
        ).toBe(1000);
    });
});

describe("every surface shows parts that add up to their parent", () => {
    it("dashboard rail: income + From savings = What October cost me", () => {
        render(<SummaryRail {...shared} />);
        const rail = screen.getByTestId("feed-totals");
        const headline = money(
            within(rail).getByRole("heading", { name: /cost me/ })
                .nextElementSibling,
        );
        const income = money(
            within(rail).getByText("From this month's income")
                .nextElementSibling,
        );
        const savings = money(
            within(rail).getByText("From savings").nextElementSibling,
        );

        expect(headline).toBe(5968);
        expect(income + savings).toBeCloseTo(headline, 2);
        // The refund and the row lists live in Full breakdown, not the rail.
        expect(within(rail).queryByText("Reimbursed")).toBeNull();
        expect(
            within(rail).queryByRole("list", { name: /expenses/ }),
        ).toBeNull();
    });

    it("Expenses footer: From savings + Reimbursed = Outside income", () => {
        render(
            <SummaryStrip
                {...shared}
                visibleCount={5}
                categoryLabel="All categories"
            />,
        );
        const footer = screen.getByTestId("totals-footer");
        const parent = money(
            within(footer).getByText("Outside income").nextElementSibling,
        );

        expect(parent).toBe(8788);
        expect(
            partAmount(footer, "From savings") +
                partAmount(footer, "Reimbursed"),
        ).toBeCloseTo(parent, 2);
        expectListsAddUp(footer);
    });

    it("breakdown pot: each of its two cuts adds up to the headline", () => {
        render(<MonthBreakdown {...shared} />);
        const pot = screen.getByText("outside the budget").parentElement!;
        const headline = money(
            within(pot).getByText("outside the budget").previousElementSibling,
        );
        const rowAmount = (label: string) =>
            money(
                within(pot).getByText(label).closest("div")!.lastElementChild,
            );

        expect(headline).toBe(9788);
        expect(within(pot).getByText("By who it went to")).toBeDefined();
        expect(
            rowAmount("Own spending") + rowAmount("Paid to Avery"),
        ).toBeCloseTo(headline, 2);

        expect(within(pot).getByText("By which money paid")).toBeDefined();
        // "From savings" is the same 5,288 the rail and footer show; the legacy
        // transfer is its own row, not folded into it.
        expect(partAmount(pot, "From savings")).toBe(5288);
        expect(
            partAmount(pot, "From savings") +
                partAmount(pot, "Reimbursed") +
                rowAmount("Transfers to Avery (from savings)"),
        ).toBeCloseTo(headline, 2);
        expectListsAddUp(pot);
    });

    it("dashboard stat strip: From savings + Reimbursed = Not from this month's income", () => {
        render(
            <StatStrip
                income={20000}
                spent={680}
                net={19320}
                dailyAvg={100}
                daysLeft={10}
                expenses={expenses}
            />,
        );
        const line = screen.getByText(/^Not from this month's income:/);
        const block = line.parentElement!;

        expect(money(line)).toBe(8788);
        expect(
            partAmount(block, "From savings") + partAmount(block, "Reimbursed"),
        ).toBeCloseTo(money(line), 2);
        expectListsAddUp(block);
    });
});

describe("a funding sub-row", () => {
    it("gives its tap target at least 24px (WCAG 2.5.8)", () => {
        render(
            <FundingPart
                source="fromSavings"
                amount={4758}
                rows={fundingRows.fromSavings}
            />,
        );
        const summary = screen.getByText("From savings").closest("summary")!;
        expect(summary.className.split(" ")).toContain("min-h-6");
    });
});

describe("the expanded mobile chin", () => {
    it("caps its panel so an opened list scrolls inside it and the toggle stays on screen", () => {
        render(
            <SummaryStrip
                {...shared}
                visibleCount={5}
                categoryLabel="All categories"
            />,
        );
        const toggle = screen.getByRole("button", { name: /Show totals/ });
        const [, panelId] = toggle.getAttribute("aria-controls")!.split(" ");
        const panel = document.getElementById(panelId!)!;
        const classes = panel.className.split(" ");

        expect(classes).toContain("max-sm:max-h-[calc(100dvh-14rem)]");
        expect(classes).toContain("max-sm:overflow-y-auto");
        // The toggle sits outside the capped panel, so it never scrolls away.
        expect(panel.contains(toggle)).toBe(false);
        expect(within(panel).getByText("From savings")).toBeDefined();
    });
});

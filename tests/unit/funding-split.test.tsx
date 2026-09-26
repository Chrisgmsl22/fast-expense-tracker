import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { BottomLine } from "@/components/money/BottomLine";
import { FundingSplit } from "@/components/money/FundingSplit";
import { MonthBreakdown } from "@/components/money/MonthBreakdown";
import { SummaryRail } from "@/components/money/SummaryRail";
import { SummaryStrip } from "@/components/money/SummaryStrip";
import { computeFeedTotals } from "@/lib/domain/movement";
import { formatExpenseDate } from "@/lib/format";
import type { CoupleBalance } from "@/lib/domain/settlement";
import { funded, fundingRowsOf } from "@/tests/support/funding-rows";

const month = [
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
        date: new Date("2026-10-04T12:00:00Z"),
    }),
    funded({
        id: "r1",
        amount: 3500,
        actualExpenditure: 3500,
        isPartnerPayment: false,
        category: { slug: "health" },
        fundedFrom: "reimbursed",
        description: "Clinic visit",
        date: new Date("2026-10-09T12:00:00Z"),
    }),
    funded({
        id: "sv",
        amount: 2000,
        actualExpenditure: 2000,
        isPartnerPayment: false,
        category: { slug: "savings" },
        fundedFrom: "income",
        description: "Emergency fund",
    }),
];
const totals = computeFeedTotals(month);
const fundingRows = fundingRowsOf(month);

function subRow(label: string) {
    return screen.getByText(label).closest("details")!;
}

describe("FundingSplit", () => {
    it("draws nothing when neither source holds money", () => {
        const { container } = render(
            <FundingSplit
                fromSavings={0}
                reimbursed={0}
                rows={fundingRowsOf([])}
            />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("shows both sub-rows collapsed, each opening onto its own rows", () => {
        render(
            <FundingSplit
                fromSavings={4758}
                reimbursed={3500}
                rows={fundingRows}
            />,
        );

        const savings = subRow("From savings");
        const reimbursed = subRow("Reimbursed");
        expect(savings.open).toBe(false);
        expect(reimbursed.open).toBe(false);
        // Once on the sub-row, once on the one row behind it.
        expect(within(savings).getAllByText("$4,758.00")).toHaveLength(2);
        expect(
            within(reimbursed).getByText("paid back · net $0"),
        ).toBeDefined();

        const savingsList = within(savings).getByRole("list", {
            name: "From savings expenses",
        });
        expect(within(savingsList).getByText("New laptop")).toBeDefined();
        expect(
            within(savingsList).getByText(
                formatExpenseDate(new Date("2026-10-04T12:00:00Z")),
            ),
        ).toBeDefined();
        expect(within(savingsList).getByText("$4,758.00")).toBeDefined();
        expect(within(savingsList).queryByText("Clinic visit")).toBeNull();
        expect(within(reimbursed).getByText("Clinic visit")).toBeDefined();

        fireEvent.click(within(savings).getByText("From savings"));
        expect(savings.open).toBe(true);
    });

    it("drops a zero sub-row", () => {
        render(
            <FundingSplit
                fromSavings={4758}
                reimbursed={0}
                rows={fundingRows}
            />,
        );
        expect(screen.getByText("From savings")).toBeDefined();
        expect(screen.queryByText("Reimbursed")).toBeNull();
    });
});

describe("the split on every surface that names outside-income money", () => {
    const shared = {
        monthLabel: "October 2026",
        partnerName: "Avery",
        sharesExpenses: true,
        isCurrentMonth: true,
        fundingRows,
    };

    it("tells one story on the dashboard rail: cost = income + savings", () => {
        render(<SummaryRail totals={totals} {...shared} />);
        const rail = within(screen.getByTestId("feed-totals"));

        // 680 + 4,758. The refund is outside the cost, and off the rail.
        expect(rail.getByText("$5,438.00")).toBeDefined();
        expect(
            rail.getByText("From savings").nextElementSibling?.textContent,
        ).toBe("$4,758.00");
        expect(rail.queryByText("Reimbursed")).toBeNull();
        expect(rail.queryByText("Outside income")).toBeNull();
        expect(rail.getByText("Saved").nextElementSibling?.className).toContain(
            "text-positive",
        );
    });

    it("splits the other-money pot in the breakdown and greens Set aside", () => {
        render(<MonthBreakdown totals={totals} {...shared} />);

        const pot = screen.getByText("outside the budget").parentElement!;
        expect(within(pot).getByText("From savings")).toBeDefined();
        expect(within(pot).getByText("Clinic visit")).toBeDefined();

        const incomePot = screen.getByText(
            "counts toward your budget buckets",
        ).parentElement!;
        expect(
            within(incomePot).getByText("Set aside").parentElement!
                .nextElementSibling!.className,
        ).toContain("text-positive");
    });

    it("keeps both halves in the Expenses footer, collapsed on mobile by default", () => {
        render(
            <SummaryStrip
                totals={totals}
                {...shared}
                visibleCount={4}
                categoryLabel="All categories"
            />,
        );
        const footer = within(screen.getByTestId("totals-footer"));
        expect(footer.getByText("From savings")).toBeDefined();
        expect(footer.getByText("Reimbursed")).toBeDefined();
        expect(subRow("From savings").open).toBe(false);
    });
});

describe("BottomLine", () => {
    it("heads the block as where the income went, and reads Set aside as kept", () => {
        render(<BottomLine totals={totals} partnerName="Avery" />);

        expect(
            screen.getByText("Where this month's income went"),
        ).toBeDefined();
        expect(screen.queryByText(/Out of this month's income/)).toBeNull();
        expect(screen.getByText("kept, not spent")).toBeDefined();
        const amount = screen.getByText("$2,000.00");
        expect(amount.className).toContain("text-positive");
    });
});

describe("the mobile chin on the Expenses screen", () => {
    const settlement: CoupleBalance = {
        amount: 77,
        balance: 77,
        direction: "she_owes",
        breakdown: [],
    };
    const renderChin = () =>
        render(
            <SummaryStrip
                totals={totals}
                monthLabel="October 2026"
                partnerName="Avery"
                sharesExpenses
                isCurrentMonth
                settlement={settlement}
                visibleCount={4}
                categoryLabel="All categories"
                fundingRows={fundingRows}
            />,
        );

    it("starts as one line of My cost and Charged", () => {
        renderChin();
        const toggle = screen.getByRole("button", { name: /Show totals/ });
        expect(toggle.textContent).toContain(
            "My cost $5,438.00 · Charged $9,258.00",
        );
        expect(toggle.textContent).toContain("Show totals");
        for (const id of toggle.getAttribute("aria-controls")!.split(" ")) {
            expect(document.getElementById(id)!.className).toContain(
                "max-sm:hidden",
            );
        }
    });

    it("opens to the full content on tap, and closes again", () => {
        renderChin();
        const toggle = screen.getByRole("button", { name: /Show totals/ });
        const ids = toggle.getAttribute("aria-controls")!.split(" ");

        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(toggle.textContent).toContain("Hide totals");
        for (const id of ids) {
            expect(document.getElementById(id)!.className).not.toContain(
                "max-sm:hidden",
            );
        }

        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("keeps the settlement chip outside the collapsed part", () => {
        renderChin();
        const chip = screen.getByText("$77.00");
        const toggle = screen.getByRole("button", { name: /Show totals/ });
        for (const id of toggle.getAttribute("aria-controls")!.split(" ")) {
            expect(document.getElementById(id)!.contains(chip)).toBe(false);
        }
    });

    it("pads the pinned chin for the Safari bottom bar", () => {
        renderChin();
        expect(screen.getByTestId("totals-footer").className).toContain(
            "pb-[env(safe-area-inset-bottom)]",
        );
    });

    it("greens Set aside when it takes the partner's slot", () => {
        const solo = computeFeedTotals(
            [month[0]!, month[3]!].map((row) => ({
                ...row,
                amount: row.actualExpenditure,
            })),
        );
        render(
            <SummaryStrip
                totals={solo}
                monthLabel="October 2026"
                partnerName="Avery"
                sharesExpenses={false}
                isCurrentMonth
                visibleCount={2}
                categoryLabel="All categories"
                fundingRows={fundingRowsOf([])}
            />,
        );
        expect(
            screen.getByText("Set aside").parentElement!.className,
        ).toContain("text-positive");
    });
});

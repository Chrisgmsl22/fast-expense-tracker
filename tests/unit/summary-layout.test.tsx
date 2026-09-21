import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { SummaryRail } from "@/components/money/SummaryRail";
import { SummaryStrip } from "@/components/money/SummaryStrip";
import { summaryCost, summaryMetrics } from "@/components/money/summary-model";
import {
    computeFeedTotals,
    type FeedTotalExpense,
} from "@/lib/domain/movement";

const row: FeedTotalExpense = {
    id: "income",
    amount: 100,
    actualExpenditure: 40,
    category: { slug: "food" },
    isPartnerPayment: false,
    fundedFrom: "income",
};
const rows: FeedTotalExpense[] = [
    row,
    {
        ...row,
        id: "savings",
        amount: 80,
        actualExpenditure: 60,
        fundedFrom: "savings",
    },
    {
        ...row,
        id: "refund",
        amount: 30,
        actualExpenditure: 30,
        fundedFrom: "reimbursed",
    },
    {
        ...row,
        id: "allocation",
        amount: 50,
        actualExpenditure: 50,
        category: { slug: "savings" },
    },
    {
        ...row,
        id: "payment",
        amount: 20,
        actualExpenditure: 20,
        isPartnerPayment: true,
    },
];
const totals = computeFeedTotals(rows, [
    { id: "payment", type: "gf_paid", amount: 20, fundedFrom: "income" },
    { id: "legacy", type: "gf_paid", amount: 15, fundedFrom: "income" },
    { id: "received", type: "gf_received", amount: 10, fundedFrom: "income" },
]);
const sharedProps = {
    monthLabel: "June 2026",
    partnerName: "Avery",
    sharesExpenses: true,
    isCurrentMonth: true,
};

afterEach(() => vi.unstubAllGlobals());

describe("summary layout", () => {
    it("partitions personal cost without a second outside-income subtraction", () => {
        expect(summaryCost(totals)).toEqual({
            amount: 150,
            incomePercent: 40,
            outsideIncomePercent: 60,
        });
        expect(totals.total).toBe(125);
        const metrics = summaryMetrics(totals, "Avery", true);
        expect(metrics.map((metric) => metric.amount)).toEqual([
            230, 150, 90, 80,
        ]);
    });

    it("preserves historical partner shares in solo mode", () => {
        expect(summaryMetrics(totals, "Avery", false)[3]).toEqual({
            key: "partner",
            label: "Avery's share",
            amount: 80,
        });
        const solo = computeFeedTotals([
            { ...row, actualExpenditure: 100 },
            rows[3]!,
        ]);
        expect(summaryMetrics(solo, "Avery", false)[3]).toEqual({
            key: "set-aside",
            label: "Set aside",
            amount: 50,
        });
    });

    it("uses the stored partner slice when an outside-income savings-category row has no charge", () => {
        const withSavingsCategory = computeFeedTotals([
            ...rows,
            { ...rows[3]!, id: "old-savings", fundedFrom: "savings" },
        ]);
        expect(summaryCost(withSavingsCategory).amount).toBe(200);
        expect(
            summaryMetrics(withSavingsCategory, "Avery", true)[3]?.amount,
        ).toBe(80);
    });

    it("has finite zero bar widths for an empty month", () => {
        expect(summaryCost(computeFeedTotals([]))).toEqual({
            amount: 0,
            incomePercent: 0,
            outsideIncomePercent: 0,
        });
        render(
            <SummaryRail
                totals={computeFeedTotals([])}
                {...sharedProps}
                sharesExpenses={false}
                incomeTotal={0}
            />,
        );
        expect(
            screen.getByRole("heading", { name: "What June 2026 cost me" }),
        ).toBeDefined();
        expect(screen.getByText("$0.00 left")).toBeDefined();
        expect(screen.queryByText(/Avery/)).toBeNull();
    });

    it("shows a negative income remainder without a false positive sign", () => {
        render(
            <SummaryRail totals={totals} {...sharedProps} incomeTotal={100} />,
        );
        expect(screen.getByText("$25.00 over income").className).toContain(
            "text-danger",
        );
        expect(
            screen.getByText("From this month's income").nextElementSibling
                ?.textContent,
        ).toBe("$60.00");
        expect(
            screen.getByText("Outside income").nextElementSibling?.textContent,
        ).toBe("$90.00");
        expect(
            screen.getByText("Set aside to savings").nextElementSibling
                ?.textContent,
        ).toBe("$50.00");
        expect(
            screen.getByText("You paid Avery").nextElementSibling?.textContent,
        ).toBe("$35.00");
    });

    it("opens the unchanged breakdown with the same income total", async () => {
        render(
            <SummaryRail totals={totals} {...sharedProps} incomeTotal={200} />,
        );
        expect(screen.getByText("$75.00 left")).toBeDefined();
        fireEvent.click(
            screen.getByRole("button", { name: "See full breakdown" }),
        );
        const dialog = within(await screen.findByRole("dialog"));
        expect(dialog.getAllByText("$125.00")).toHaveLength(2);
        expect(dialog.getAllByText("What I really spent")).toHaveLength(2);
        expect(dialog.getAllByText("$90.00").length).toBeGreaterThan(0);
    });

    it("reserves the actual fixed footer height and disconnects its observer", () => {
        let update: ResizeObserverCallback | undefined;
        const disconnect = vi.fn();
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(callback: ResizeObserverCallback) {
                    update = callback;
                }
                observe() {}
                disconnect = disconnect;
            },
        );
        const { container, unmount } = render(
            <SummaryStrip
                totals={totals}
                {...sharedProps}
                visibleCount={7}
                categoryLabel="All categories"
            />,
        );
        const footer = screen.getByRole("region", {
            name: "Visible activity totals",
        });
        vi.spyOn(footer, "getBoundingClientRect").mockReturnValue({
            height: 412,
        } as DOMRect);
        act(() => update?.([{} as ResizeObserverEntry], {} as ResizeObserver));
        expect((container.firstElementChild as HTMLElement).style.height).toBe(
            "412px",
        );
        unmount();
        expect(disconnect).toHaveBeenCalledOnce();
    });
});

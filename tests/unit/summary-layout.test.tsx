import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { SummaryRail } from "@/components/money/SummaryRail";
import { SummaryStrip } from "@/components/money/SummaryStrip";
import { summaryCost, summaryMetrics } from "@/components/money/summary-model";
import {
    computeFeedTotals,
    type FeedTotalExpense,
} from "@/lib/domain/movement";
import { fundingRowsOf } from "@/tests/support/funding-rows";

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
    fundingRows: fundingRowsOf(rows),
};

afterEach(() => vi.unstubAllGlobals());

describe("summary layout", () => {
    it("partitions personal cost without a second outside-income subtraction", () => {
        // 60 from income + 60 from savings; the 30 refund was paid back, net $0.
        expect(summaryCost(totals)).toEqual({
            amount: 120,
            incomePercent: 50,
            outsideIncomePercent: 50,
        });
        expect(totals.total).toBe(125);
        const metrics = summaryMetrics(totals, "Avery", true);
        // Charged and "Outside income" still hold the refund at full value.
        expect(metrics.map((metric) => metric.amount)).toEqual([
            230, 120, 90, 80,
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
        expect(summaryCost(withSavingsCategory).amount).toBe(170);
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
                fundingRows={fundingRowsOf([])}
                sharesExpenses={false}
                incomeTotal={0}
            />,
        );
        expect(
            screen.getByRole("heading", { name: "What June 2026 cost me" }),
        ).toBeDefined();
        expect(screen.getByText("$0.00 charged")).toBeDefined();
        // Solo with no partner cash, and nothing kept: neither pill is drawn.
        expect(screen.queryByText(/Avery/)).toBeNull();
        expect(screen.queryByText("Saved")).toBeNull();
        expect(screen.queryByText("From savings")).toBeNull();
    });

    it("partitions the headline with its two legend rows", () => {
        render(<SummaryRail totals={totals} {...sharedProps} />);
        const rail = within(screen.getByTestId("feed-totals"));
        const figure = (label: string) =>
            rail.getByText(label).nextElementSibling?.textContent;

        expect(
            rail.getByRole("heading", { name: "What June 2026 cost me" })
                .nextElementSibling?.textContent,
        ).toBe("$120.00");
        expect(rail.getByText("$230.00 charged")).toBeDefined();
        expect(figure("From this month's income")).toBe("$60.00");
        expect(figure("From savings")).toBe("$60.00");
    });

    it("gates the income legend row at zero like its savings sibling (R4-N3)", () => {
        const savingsOnly = computeFeedTotals([
            { ...row, id: "savings-only", fundedFrom: "savings" },
        ]);
        render(<SummaryRail totals={savingsOnly} {...sharedProps} />);
        const rail = within(screen.getByTestId("feed-totals"));
        expect(rail.queryByText("From this month's income")).toBeNull();
        expect(rail.getByText("From savings")).toBeDefined();
    });

    it("shows what was kept in a green Saved pill", () => {
        render(<SummaryRail totals={totals} {...sharedProps} />);
        const saved = screen.getByText("Saved").nextElementSibling!;
        expect(saved.textContent).toBe("$50.00");
        expect(saved.className).toContain("text-positive");
    });

    it("names both partner flows in words, with no net", () => {
        render(<SummaryRail totals={totals} {...sharedProps} />);
        const rail = within(screen.getByTestId("feed-totals"));
        // 20 payment-expense + 15 legacy transfer out; 10 back from her.
        const sent = rail.getByRole("listitem", {
            name: "You sent Avery $35.00",
        });
        const received = rail.getByRole("listitem", {
            name: "Avery sent you $10.00",
        });
        expect(sent.querySelector(".text-money-out")).not.toBeNull();
        expect(received.querySelector(".text-positive")).not.toBeNull();
        expect(rail.queryByText("$25.00")).toBeNull();
    });

    it("keeps flow ids unique when two rails render on one page", () => {
        const totalsA = computeFeedTotals(
            [row],
            [
                {
                    id: "a-payment",
                    type: "gf_paid",
                    amount: 35,
                    fundedFrom: "income",
                },
            ],
        );
        const totalsB = computeFeedTotals(
            [row],
            [
                {
                    id: "b-payment",
                    type: "gf_paid",
                    amount: 90,
                    fundedFrom: "income",
                },
            ],
        );
        render(
            <>
                <SummaryRail totals={totalsA} {...sharedProps} />
                <SummaryRail totals={totalsB} {...sharedProps} />
            </>,
        );
        expect(
            screen.getByRole("listitem", { name: "You sent Avery $35.00" }),
        ).toBeDefined();
        expect(
            screen.getByRole("listitem", { name: "You sent Avery $90.00" }),
        ).toBeDefined();

        const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it.each([
        { sharesExpenses: true, drawn: true },
        { sharesExpenses: false, drawn: false },
    ])(
        "draws the partner pill on a month with no partner cash only when sharing ($sharesExpenses)",
        ({ sharesExpenses, drawn }) => {
            const solo = computeFeedTotals([row]);
            render(
                <SummaryRail
                    totals={solo}
                    {...sharedProps}
                    sharesExpenses={sharesExpenses}
                />,
            );
            expect(
                screen.queryByRole("listitem", {
                    name: "You sent Avery $0.00",
                }) !== null,
            ).toBe(drawn);
        },
    );

    it("keeps a solo user's partner history in the pill", () => {
        render(
            <SummaryRail
                totals={totals}
                {...sharedProps}
                sharesExpenses={false}
            />,
        );
        expect(
            screen.getByRole("listitem", { name: "You sent Avery $35.00" }),
        ).toBeDefined();
    });

    it("shows the pill for cash she sent, even in solo mode with nothing paid to her (R4-1)", () => {
        // Nothing shared, nothing paid to her — the ONLY reason to draw the
        // pill here is the money she sent, so this pins that clause alone.
        const receivedOnly = computeFeedTotals(
            [],
            [
                {
                    id: "r1",
                    type: "gf_received",
                    amount: 500,
                    fundedFrom: "income",
                },
            ],
        );
        render(
            <SummaryRail
                totals={receivedOnly}
                {...sharedProps}
                sharesExpenses={false}
            />,
        );
        expect(
            screen.getByRole("listitem", { name: "Avery sent you $500.00" }),
        ).toBeDefined();
    });

    it("opens the breakdown with the same income total", async () => {
        render(
            <SummaryRail totals={totals} {...sharedProps} incomeTotal={200} />,
        );
        expect(screen.queryByText("$75.00 left")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Full breakdown" }));
        const dialog = within(await screen.findByRole("dialog"));
        expect(dialog.getByText("$75.00 left")).toBeDefined();
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

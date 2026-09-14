import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { SettlementBreakdown } from "@/components/settlement/SettlementBreakdown";
import { computeCoupleBalance } from "@/lib/domain/settlement";
import type { SettlementBreakdownKey } from "@/lib/domain/settlement";
import { formatMxn } from "@/lib/format";
import type {
    SettlementExpenseRow,
    SettlementMovementRow,
} from "@/lib/repositories/settlement.repository";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { FakeSettlementRepository } from "@/tests/support/fake-settlement-repository";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";

// now = mid-July → window is June + July (same frame as the service test).
const NOW = new Date("2026-07-15T12:00:00Z");
const JULY = new Date("2026-07-10T06:00:00Z");
const JUNE = new Date("2026-06-20T06:00:00Z");

const KEYS: SettlementBreakdownKey[] = [
    "partner_share",
    "your_debt",
    "partner_paid",
    "you_paid",
];

/** A window holding all four kinds at once, plus a solo expense that adds nothing. */
const EXPENSES: SettlementExpenseRow[] = [
    {
        id: "e1",
        date: JULY,
        description: "Groceries",
        amount: 1000,
        actualExpenditure: 680,
        isShared: true,
        createdAt: JULY,
    },
    {
        id: "e2",
        date: JUNE,
        description: "Dinner",
        amount: 450.5,
        actualExpenditure: 306.34,
        isShared: true,
        createdAt: JUNE,
    },
    {
        id: "e3",
        date: JULY,
        description: "My haircut",
        amount: 500,
        actualExpenditure: 500,
        isShared: false,
        createdAt: JULY,
    },
];

const MOVEMENTS: SettlementMovementRow[] = [
    {
        id: "m1",
        date: JULY,
        amount: 300,
        type: "gf_fronted",
        note: "Uber home",
        createdAt: JULY,
        closedAt: null,
    },
    {
        id: "m2",
        date: JUNE,
        amount: 120,
        type: "gf_fronted",
        note: null,
        createdAt: JUNE,
        closedAt: null,
    },
    {
        id: "m3",
        date: JULY,
        amount: 20.25,
        type: "gf_received",
        note: null,
        createdAt: JULY,
        closedAt: null,
    },
    {
        id: "m4",
        date: JUNE,
        amount: 100,
        type: "gf_paid",
        note: "rent",
        createdAt: JUNE,
        closedAt: null,
    },
    // Never part of the balance, so never part of any line.
    {
        id: "m5",
        date: JULY,
        amount: 999,
        type: "card_payment",
        note: null,
        createdAt: JULY,
        closedAt: null,
    },
];

/** Read a rendered money string back as a number, the way a reader adds them up. */
const parseMxn = (formatted: string): number =>
    Number(formatted.replace(/[^0-9.-]/g, ""));

/**
 * Criterion 4 the way the screen shows it: format every row, add the formatted
 * figures, and compare against the formatted line total. Summing the raw floats
 * and rounding once would pass for any partition, so it proves nothing.
 */
function assertRowsReadUpToTotal(
    rows: { amount: number }[],
    lineTotal: number,
): void {
    const asRead = rows.reduce(
        (sum, r) => sum + parseMxn(formatMxn(r.amount)),
        0,
    );
    expect(formatMxn(asRead)).toBe(formatMxn(lineTotal));
}

function run(
    expenses: SettlementExpenseRow[] = EXPENSES,
    movements: SettlementMovementRow[] = MOVEMENTS,
) {
    const settlementRepo = new FakeSettlementRepository();
    settlementRepo.setExpenses(expenses);
    settlementRepo.setMovements(movements);
    const settingsRepo = new FakeSettingsRepository();
    settingsRepo.seed("u1", { sharesExpenses: true, partnerName: "Brenda" });
    return getSettlement("u1", { settlementRepo, settingsRepo, now: NOW });
}

describe("getSettlement breakdown items", () => {
    it("sums each line's rows to exactly that line's displayed total", async () => {
        const s = await run();
        for (const line of s.balance.breakdown) {
            assertRowsReadUpToTotal(s.breakdownItems[line.key], line.amount);
        }
        // The fixture really does exercise all four lines.
        for (const key of KEYS) {
            expect(s.breakdownItems[key].length).toBeGreaterThan(0);
        }
    });

    it("still adds up when the split leaves sub-cent residue on every row", async () => {
        // $33.33 at a 68% split stores actualExpenditure 22.6644, so each row's
        // share is 10.6656 — three rows that each round UP to $10.67 ($32.01)
        // against a line total of 31.9968 ($32.00). The residual has to land on
        // one row or the screen contradicts itself.
        const thirds: SettlementExpenseRow[] = [1, 2, 3].map((n) => ({
            id: `t${n}`,
            date: JULY,
            description: `Split ${n}`,
            amount: 33.33,
            actualExpenditure: 22.6644,
            isShared: true,
            createdAt: JULY,
        }));
        const s = await run(thirds, []);
        const line = s.balance.breakdown.find(
            (l) => l.key === "partner_share",
        )!;

        expect(formatMxn(line.amount)).toBe("$32.00");
        assertRowsReadUpToTotal(s.breakdownItems.partner_share, line.amount);
        // Every row is a clean cent figure, and the residual sits on one of them.
        expect(
            s.breakdownItems.partner_share.map((r) => formatMxn(r.amount)),
        ).toEqual(["$10.66", "$10.67", "$10.67"]);
    });

    it("quotes the same money in the journal as in the breakdown, row for row", async () => {
        // Both panels read one derived row set, so a $33.33 three-way split
        // can't render 10.66 on the left and 10.67 on the right.
        const thirds: SettlementExpenseRow[] = [1, 2, 3].map((n) => ({
            id: `t${n}`,
            date: JULY,
            description: `Split ${n}`,
            amount: 33.33,
            actualExpenditure: 22.6644,
            isShared: true,
            createdAt: JULY,
        }));
        const s = await run(thirds, MOVEMENTS);

        const journalAmount = new Map(
            s.journal.map((j) => [
                j.id,
                j.kind === "your_expense" ? j.partnerShare : j.amount,
            ]),
        );
        for (const key of KEYS) {
            for (const row of s.breakdownItems[key]) {
                expect(formatMxn(journalAmount.get(row.id)!)).toBe(
                    formatMxn(row.amount),
                );
            }
        }
        // Both panels show these three figures, and both add up to $32.00.
        const asShown = ["$10.66", "$10.67", "$10.67"];
        expect(
            s.breakdownItems.partner_share.map((r) => formatMxn(r.amount)),
        ).toEqual(asShown);
        expect(
            s.journal
                .filter((j) => j.kind === "your_expense")
                .map((j) => formatMxn(j.partnerShare)),
        ).toEqual(asShown);

        // And the journal's own copy of the line still reads up to the total.
        const line = s.balance.breakdown.find(
            (l) => l.key === "partner_share",
        )!;
        assertRowsReadUpToTotal(
            s.journal
                .filter((j) => j.kind === "your_expense")
                .map((j) => ({ amount: j.partnerShare })),
            line.amount,
        );
    });

    it("shows the same rows in both panels — one predicate, not two", async () => {
        const s = await run();
        const journalIds = s.journal.map((j) => j.id).sort();
        const breakdownIds = KEYS.flatMap((k) =>
            s.breakdownItems[k].map((r) => r.id),
        ).sort();
        expect(journalIds).toEqual(breakdownIds);
    });

    it("leaves the balance, the four totals and the net untouched", async () => {
        const s = await run();
        expect(s.balance).toEqual(
            computeCoupleBalance({
                partnerShareOfYourExpenses: 320 + (450.5 - 306.34),
                yourDebtToPartner: 420,
                moneyPartnerPaidYou: 20.25,
                moneyYouPaidPartner: 100,
            }),
        );
    });

    it("keeps a solo expense and a card payment out of every line", async () => {
        const s = await run();
        const ids = KEYS.flatMap((k) => s.breakdownItems[k].map((r) => r.id));
        expect(ids).not.toContain("e3");
        expect(ids).not.toContain("m5");
    });

    it("describes rows the way the journal does, with the same fallbacks", async () => {
        const s = await run();
        expect(s.breakdownItems.partner_share[0]).toMatchObject({
            description: "Groceries",
            amount: 320,
            gross: 1000,
        });
        expect(s.breakdownItems.your_debt.map((r) => r.description)).toEqual([
            "Uber home",
            "I owe Brenda", // no note → the default debt label
        ]);
        expect(s.breakdownItems.partner_paid[0]!.description).toBe(
            "Transfer — Brenda paid you",
        );
        expect(s.breakdownItems.you_paid[0]!.description).toBe("rent");
    });

    it("orders rows newest first, breaking a same-date tie by createdAt", async () => {
        const sameDay = (
            id: string,
            createdAt: string,
        ): SettlementMovementRow => ({
            id,
            date: JULY,
            amount: 10,
            type: "gf_paid",
            note: id,
            createdAt: new Date(createdAt),
            closedAt: null,
        });

        const s = await run(
            [],
            [
                sameDay("older", "2026-07-10T08:00:00Z"),
                sameDay("newer", "2026-07-10T20:00:00Z"),
                { ...sameDay("june", "2026-06-20T08:00:00Z"), date: JUNE },
            ],
        );
        expect(s.breakdownItems.you_paid.map((r) => r.id)).toEqual([
            "newer",
            "older",
            "june",
        ]);
    });

    it("returns an empty list for a line with nothing in the window", async () => {
        const s = await run([], []);
        for (const key of KEYS) expect(s.breakdownItems[key]).toEqual([]);
    });
});

describe("SettlementBreakdown disclosure", () => {
    const balance = computeCoupleBalance({
        partnerShareOfYourExpenses: 320,
        yourDebtToPartner: 0,
        moneyPartnerPaidYou: 0,
        moneyYouPaidPartner: 0,
    });
    const breakdownItems = {
        partner_share: [
            {
                id: "e1",
                date: JULY,
                description: "Groceries",
                amount: 320,
                gross: 1000,
            },
        ],
        your_debt: [],
        partner_paid: [],
        you_paid: [],
    };

    const renderIt = () =>
        render(
            <SettlementBreakdown
                balance={balance}
                breakdownItems={breakdownItems}
                partnerName="Brenda"
            />,
        );

    it("starts collapsed, with a named trigger that reports its state", () => {
        renderIt();
        const trigger = screen.getByRole("button", {
            name: /32% of shared expenses you logged/,
        });
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        // The panel stays mounted so the reference resolves, but `hidden` keeps
        // it out of the a11y tree and off the screen until it is opened.
        const panelId = trigger.getAttribute("aria-controls");
        expect(panelId).toBeTruthy();
        const panel = document.getElementById(panelId!);
        expect(panel).not.toBeNull();
        expect(panel!.hasAttribute("hidden")).toBe(true);
    });

    it("reveals the row, its date and both labelled figures when expanded", async () => {
        renderIt();
        fireEvent.click(
            screen.getByRole("button", {
                name: /32% of shared expenses you logged/,
            }),
        );
        const trigger = screen.getByRole("button", {
            name: /32% of shared expenses you logged/,
        });
        await waitFor(() =>
            expect(trigger.getAttribute("aria-expanded")).toBe("true"),
        );
        // Revealed, not merely present: the panel drops `hidden` when it opens.
        const panel = document.getElementById(
            trigger.getAttribute("aria-controls")!,
        )!;
        expect(panel.hasAttribute("hidden")).toBe(false);
        expect(screen.getByText("Groceries")).toBeDefined();
        // The row's own contribution and the expense it came out of, labelled.
        expect(screen.getAllByText(/\$320\.00/).length).toBeGreaterThan(0);
        expect(
            screen.getByText(/Brenda's share of \$1,000\.00 you paid/),
        ).toBeDefined();
    });

    it("shows a short note instead of an expandable region for an empty line", () => {
        renderIt();
        expect(screen.getAllByText(/nothing this window/)).toHaveLength(3);
        expect(
            screen.queryByRole("button", { name: /Money you paid Brenda/ }),
        ).toBeNull();
    });

    it("says so plainly when a line has a total but no rows behind it", () => {
        render(
            <SettlementBreakdown
                balance={balance}
                breakdownItems={{ ...breakdownItems, partner_share: [] }}
                partnerName="Brenda"
            />,
        );
        // A non-zero total with no rows is an inconsistency, not an empty window.
        expect(screen.getByText(/no itemized rows/)).toBeDefined();
        expect(screen.getAllByText(/nothing this window/)).toHaveLength(3);
    });

    it("expands the same way when you owe her and when the balance is settled", () => {
        const youOwe = computeCoupleBalance({
            partnerShareOfYourExpenses: 0,
            yourDebtToPartner: 300,
            moneyPartnerPaidYou: 0,
            moneyYouPaidPartner: 0,
        });
        const debtItems = {
            ...breakdownItems,
            partner_share: [],
            your_debt: [
                {
                    id: "m1",
                    date: JULY,
                    description: "Uber home",
                    amount: 300,
                    gross: null,
                },
            ],
        };
        const { unmount } = render(
            <SettlementBreakdown
                balance={youOwe}
                breakdownItems={debtItems}
                partnerName="Brenda"
            />,
        );
        expect(screen.getByText("You owe Brenda $300.00")).toBeDefined();
        fireEvent.click(
            screen.getByRole("button", { name: /Debts you logged/ }),
        );
        expect(screen.getByText("Uber home")).toBeDefined();
        unmount();

        // Settled: a nonzero line can still be opened, the net just reads "Settled".
        const settled = computeCoupleBalance({
            partnerShareOfYourExpenses: 300,
            yourDebtToPartner: 300,
            moneyPartnerPaidYou: 0,
            moneyYouPaidPartner: 0,
        });
        render(
            <SettlementBreakdown
                balance={settled}
                breakdownItems={{
                    ...debtItems,
                    partner_share: [
                        {
                            id: "e1",
                            date: JULY,
                            description: "Groceries",
                            amount: 300,
                            gross: 1000,
                        },
                    ],
                }}
                partnerName="Brenda"
            />,
        );
        expect(screen.getByText("Settled")).toBeDefined();
        fireEvent.click(
            screen.getByRole("button", { name: /Debts you logged/ }),
        );
        expect(screen.getByText("Uber home")).toBeDefined();
    });
});

import { describe, it, expect } from "vitest";

import { buildSettlementSummaryText } from "@/components/settlement/settlement-summary-text";
import { computeCoupleBalance } from "@/lib/domain/settlement";
import { formatMxn } from "@/lib/format";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";

const PARTNER = "Brenda";
const day = (d: string): Date => new Date(`${d}T06:00:00Z`);

const base = { carriedOver: false, locked: false } as const;

function expense(
    id: string,
    date: string,
    description: string,
    gross: number,
    partnerShare: number,
): SettlementJournalItem {
    return {
        ...base,
        kind: "your_expense",
        id,
        date: day(date),
        description,
        gross,
        partnerShare,
    };
}

function debt(
    id: string,
    date: string,
    direction: "partner_debt" | "gf_fronted",
    description: string,
    amount: number,
): SettlementJournalItem {
    return {
        ...base,
        kind: "partner_debt",
        id,
        date: day(date),
        direction,
        description,
        amount,
        source: "movement",
    };
}

function transfer(
    id: string,
    date: string,
    direction: "gf_paid" | "gf_received",
    amount: number,
    note: string | null = null,
): SettlementJournalItem {
    return {
        ...base,
        kind: "transfer",
        id,
        date: day(date),
        direction,
        amount,
        note,
        fundedFrom: "income",
        source: "movement",
    };
}

/** Newest first, the order the service hands the journal over in. */
const newestFirst = (rows: SettlementJournalItem[]) =>
    [...rows].sort((a, b) => b.date.getTime() - a.date.getTime());

const lines = (text: string) => text.split("\n");

/** Every fixture goes through here: no "×", and no old ➕ / ➖ group emoji. */
function build(...args: Parameters<typeof buildSettlementSummaryText>) {
    const text = buildSettlementSummaryText(...args);
    expect(text).not.toMatch(/[×➕➖]/u);
    return text;
}

function balanceOf(rows: SettlementJournalItem[]) {
    const total = (pick: (r: SettlementJournalItem) => number) =>
        rows.reduce((acc, r) => acc + pick(r), 0);
    return computeCoupleBalance({
        partnerShareOfYourExpenses: total((r) =>
            r.kind === "your_expense" ? r.partnerShare : 0,
        ),
        partnerDebtToYou: total((r) =>
            r.kind === "partner_debt" && r.direction === "partner_debt"
                ? r.amount
                : 0,
        ),
        yourDebtToPartner: total((r) =>
            r.kind === "partner_debt" && r.direction === "gf_fronted"
                ? r.amount
                : 0,
        ),
        moneyPartnerPaidYou: total((r) =>
            r.kind === "transfer" && r.direction === "gf_received"
                ? r.amount
                : 0,
        ),
        moneyYouPaidPartner: total((r) =>
            r.kind === "transfer" && r.direction === "gf_paid" ? r.amount : 0,
        ),
    });
}

const DIVIDER = "———————————";

describe("buildSettlementSummaryText", () => {
    it("(a) renders the approved open-settlement example", () => {
        const journal = newestFirst([
            expense("e1", "2026-10-01", "Groceries", 500, 160),
            debt("d1", "2026-10-03", "partner_debt", "Snacks", 90),
            debt("d2", "2026-10-05", "gf_fronted", "Concert tickets", 600),
            transfer("t1", "2026-10-07", "gf_paid", 100),
        ]);

        expect(build(journal, PARTNER, "open")).toBe(
            [
                "🧾 *Settlement 01 oct 2026 – present*",
                "",
                "*Shared expenses*",
                "    • Groceries: $500.00",
                "",
                "*Subtotal: $500.00*",
                DIVIDER,
                "🌸 *Brenda owes you*",
                "    • Brenda's 32% of shared expenses: $160.00",
                "    • Snacks: $90.00",
                "",
                "*Subtotal: $250.00*",
                "",
                "🍔 *You owe Brenda*",
                "    • Concert tickets: $600.00",
                "",
                "*Subtotal: $600.00*",
                "",
                "💸 *Payments*",
                "    • You paid Brenda: $100.00",
                DIVIDER,
                "🟰 *$250.00 − $600.00 + $100.00 = −$250.00*",
                "",
                "✅ *Final outcome: Brenda receives $250.00 MXN*",
            ].join("\n"),
        );
    });

    it("(b) nets a partial payment from the partner into what she still owes", () => {
        const journal = newestFirst([
            expense("e1", "2026-09-02", "Dinner", 1000, 320),
            debt("d1", "2026-09-04", "partner_debt", "Concert", 230),
            debt("d2", "2026-09-05", "gf_fronted", "Taxi", 200),
            transfer("t1", "2026-09-06", "gf_received", 100, "Part payment"),
        ]);

        expect(build(journal, PARTNER, "closed")).toBe(
            [
                "🧾 *Settlement 02 sep 2026 – 06 sep 2026*",
                "",
                "*Shared expenses*",
                "    • Dinner: $1,000.00",
                "",
                "*Subtotal: $1,000.00*",
                DIVIDER,
                "🌸 *Brenda owes you*",
                "    • Brenda's 32% of shared expenses: $320.00",
                "    • Concert: $230.00",
                "",
                "*Subtotal: $550.00*",
                "",
                "🍔 *You owe Brenda*",
                "    • Taxi: $200.00",
                "",
                "*Subtotal: $200.00*",
                "",
                "💸 *Payments*",
                "    • Brenda paid you: $100.00 (Part payment)",
                DIVIDER,
                "🟰 *$550.00 − $200.00 − $100.00 = $250.00*",
                "",
                "✅ *Final outcome: Brenda owes $250.00 MXN*",
            ].join("\n"),
        );
    });

    it("(c) skips the calculation when only one group exists", () => {
        const journal = newestFirst([
            debt("d1", "2026-09-03", "gf_fronted", "Uber", 85),
            debt("d2", "2026-09-04", "gf_fronted", "Taxi", 40),
        ]);

        expect(build(journal, PARTNER, "open")).toBe(
            [
                "🧾 *Settlement 03 sep 2026 – present*",
                "",
                "🍔 *You owe Brenda*",
                "    • Uber: $85.00",
                "    • Taxi: $40.00",
                "",
                "*Subtotal: $125.00*",
                "",
                "✅ *Final outcome: Brenda receives $125.00 MXN*",
            ].join("\n"),
        );
    });

    it("(d) leads with a minus when there is nothing owed to you", () => {
        const text = build(
            newestFirst([
                debt("d1", "2026-09-03", "gf_fronted", "Uber", 85),
                transfer("t1", "2026-09-04", "gf_paid", 50),
            ]),
            PARTNER,
            "open",
        );
        expect(lines(text)).toContain("🟰 *−$85.00 + $50.00 = −$35.00*");
        expect(lines(text).at(-1)).toBe(
            "✅ *Final outcome: Brenda receives $35.00 MXN*",
        );
    });

    it("(e) shows the math per row when the percents differ", () => {
        const journal = newestFirst([
            expense("e1", "2026-09-01", "Groceries", 1000, 320),
            expense("e2", "2026-09-02", "Rent", 500, 250),
        ]);

        expect(build(journal, PARTNER, "closed")).toBe(
            [
                "🧾 *Settlement 01 sep 2026 – 02 sep 2026*",
                "",
                "*Shared expenses*",
                "    • Groceries: $1,000.00 (Brenda's 32%: $320.00)",
                "    • Rent: $500.00 (Brenda's 50%: $250.00)",
                "",
                "*Subtotal: $1,500.00*",
                DIVIDER,
                "🌸 *Brenda owes you*",
                "    • Brenda's share of shared expenses: $570.00",
                "",
                "*Subtotal: $570.00*",
                "",
                "✅ *Final outcome: Brenda owes $570.00 MXN*",
            ].join("\n"),
        );
    });

    it("shows the math per row when one percent does not reproduce the total", () => {
        // Both round to 33%, but 33% of $200.00 is $66.00, not $66.40.
        const text = lines(
            build(
                newestFirst([
                    expense("e1", "2026-09-01", "A", 100, 33),
                    expense("e2", "2026-09-02", "B", 100, 33.4),
                ]),
                PARTNER,
                "closed",
            ),
        );
        expect(text).toContain("    • B: $100.00 (Brenda's 33%: $33.40)");
        expect(text).toContain("*Subtotal: $200.00*");
        expect(text).toContain(
            "    • Brenda's share of shared expenses: $66.40",
        );
    });

    it("(f) ends settled at zero once a transfer squares it", () => {
        const journal = newestFirst([
            expense("e1", "2026-09-01", "Lunch", 1000, 320),
            transfer("t1", "2026-09-02", "gf_received", 320),
        ]);

        expect(build(journal, PARTNER, "closed")).toBe(
            [
                "🧾 *Settlement 01 sep 2026 – 02 sep 2026*",
                "",
                "*Shared expenses*",
                "    • Lunch: $1,000.00",
                "",
                "*Subtotal: $1,000.00*",
                DIVIDER,
                "🌸 *Brenda owes you*",
                "    • Brenda's 32% of shared expenses: $320.00",
                "",
                "*Subtotal: $320.00*",
                "",
                "💸 *Payments*",
                "    • Brenda paid you: $320.00",
                DIVIDER,
                "🟰 *$320.00 − $320.00 = $0.00*",
                "",
                "✅ *Final outcome: settled, $0.00 MXN*",
            ].join("\n"),
        );
    });

    it("draws only the calculation divider when there are no shared expenses", () => {
        const journal = newestFirst([
            debt("d1", "2026-09-01", "partner_debt", "Concert", 300),
            debt("d2", "2026-09-02", "gf_fronted", "Uber", 85),
            transfer("t1", "2026-09-03", "gf_received", 100),
        ]);

        expect(build(journal, PARTNER, "open")).toBe(
            [
                "🧾 *Settlement 01 sep 2026 – present*",
                "",
                "🌸 *Brenda owes you*",
                "    • Concert: $300.00",
                "",
                "*Subtotal: $300.00*",
                "",
                "🍔 *You owe Brenda*",
                "    • Uber: $85.00",
                "",
                "*Subtotal: $85.00*",
                "",
                "💸 *Payments*",
                "    • Brenda paid you: $100.00",
                DIVIDER,
                "🟰 *$300.00 − $85.00 − $100.00 = $115.00*",
                "",
                "✅ *Final outcome: Brenda owes $115.00 MXN*",
            ].join("\n"),
        );
    });

    it("draws only the expenses divider when there is no calculation", () => {
        const journal = newestFirst([
            expense("e1", "2026-09-01", "Lunch", 500, 160),
            debt("d1", "2026-09-02", "partner_debt", "Snacks", 40),
        ]);

        expect(build(journal, PARTNER, "open")).toBe(
            [
                "🧾 *Settlement 01 sep 2026 – present*",
                "",
                "*Shared expenses*",
                "    • Lunch: $500.00",
                "",
                "*Subtotal: $500.00*",
                DIVIDER,
                "🌸 *Brenda owes you*",
                "    • Brenda's 32% of shared expenses: $160.00",
                "    • Snacks: $40.00",
                "",
                "*Subtotal: $200.00*",
                "",
                "✅ *Final outcome: Brenda owes $200.00 MXN*",
            ].join("\n"),
        );
    });

    it("(g) dates a closed cycle to its rows and an open one to the present", () => {
        const range = newestFirst([
            expense("e1", "2026-06-02", "A", 100, 32),
            expense("e2", "2026-06-20", "B", 100, 32),
        ]);
        expect(lines(build(range, PARTNER, "closed"))[0]).toBe(
            "🧾 *Settlement 02 jun 2026 – 20 jun 2026*",
        );

        const oneDay = [expense("e1", "2026-09-03", "Lunch", 100, 32)];
        expect(lines(build(oneDay, PARTNER, "closed"))[0]).toBe(
            "🧾 *Settlement 03 sep 2026*",
        );
        expect(lines(build(oneDay, PARTNER, "open"))[0]).toBe(
            "🧾 *Settlement 03 sep 2026 – present*",
        );
    });

    it("gives a bare header and a settled outcome for no rows", () => {
        expect(build([], PARTNER, "open")).toBe(
            "🧾 *Settlement*\n\n✅ *Final outcome: settled, $0.00 MXN*",
        );
    });

    it("lists payments oldest first and sums both directions", () => {
        const text = build(
            newestFirst([
                transfer("t1", "2026-09-01", "gf_paid", 100, "Rent share"),
                transfer("t2", "2026-09-02", "gf_received", 40),
            ]),
            PARTNER,
            "closed",
        );
        expect(text).toBe(
            [
                "🧾 *Settlement 01 sep 2026 – 02 sep 2026*",
                "",
                "💸 *Payments*",
                "    • You paid Brenda: $100.00 (Rent share)",
                "    • Brenda paid you: $40.00",
                DIVIDER,
                "🟰 *$100.00 − $40.00 = $60.00*",
                "",
                "✅ *Final outcome: Brenda owes $60.00 MXN*",
            ].join("\n"),
        );
    });

    it("reverses the journal's order for rows that share a date", () => {
        // The journal lists "Second" before "First" on the same day.
        const journal = [
            expense("e2", "2026-09-03", "Second", 100, 32),
            expense("e1", "2026-09-03", "First", 100, 32),
        ];
        const text = lines(build(journal, PARTNER, "open"));
        expect(text.indexOf("    • First: $100.00")).toBeLessThan(
            text.indexOf("    • Second: $100.00"),
        );
    });

    it("takes the name and the percent from its inputs", () => {
        const text = build(
            [expense("e1", "2026-09-01", "Lunch", 200, 50)],
            "Alex",
            "open",
        );
        expect(text).toContain("*Subtotal: $200.00*");
        expect(text).toContain("🌸 *Alex owes you*");
        expect(text).toContain("    • Alex's 25% of shared expenses: $50.00");
        expect(text).toContain("✅ *Final outcome: Alex owes $50.00 MXN*");
        expect(text).not.toMatch(/Brenda|\bher\b|\bshe\b|32%/i);
    });

    it("refuses a row kind it does not know", () => {
        const unknown = {
            ...base,
            kind: "refund",
            id: "x1",
            date: day("2026-09-01"),
        } as unknown as SettlementJournalItem;
        expect(() => build([unknown], PARTNER, "open")).toThrow(
            /Unhandled settlement row/,
        );
    });

    it("ends on the figure computeCoupleBalance gives for the same rows", () => {
        const journal = newestFirst([
            expense("e1", "2026-09-01", "Groceries", 1234.56, 395.06),
            expense("e2", "2026-09-04", "Dinner", 880.1, 281.63),
            debt("d1", "2026-09-05", "partner_debt", "Concert", 410.33),
            debt("d2", "2026-09-06", "gf_fronted", "Taxi", 99.99),
            transfer("t1", "2026-09-07", "gf_paid", 150.25),
            transfer("t2", "2026-09-08", "gf_received", 300.01),
        ]);
        const balance = balanceOf(journal);
        // Guard the fixture: it must exercise a non-zero result.
        expect(balance.direction).toBe("she_owes");

        const text = lines(build(journal, PARTNER, "open"));
        const amount = formatMxn(balance.amount);
        expect(text.at(-1)).toBe(
            `✅ *Final outcome: Brenda owes ${amount} MXN*`,
        );
        expect(text).toContain(
            `🟰 *$1,087.02 − $99.99 + $150.25 − $300.01 = ${amount}*`,
        );
    });
});

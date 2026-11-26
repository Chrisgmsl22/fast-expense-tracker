import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";

import type { Locale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import {
    buildSettlementSummaryText,
    type SettlementSummaryIntl,
} from "@/components/settlement/settlement-summary-text";
import { computeCoupleBalance } from "@/lib/domain/settlement";
import { formatMxn } from "@/lib/format";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";

const names = { partner: "Brenda", owner: "Alex" };
const now = new Date("2026-11-23T05:59:59Z");
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

const intlFor = (locale: Locale): SettlementSummaryIntl => ({
    t: createTranslator({
        locale,
        messages: MESSAGES[locale],
        namespace: "settlement",
    }),
    tm: createTranslator({
        locale,
        messages: MESSAGES[locale],
        namespace: "movements",
    }),
    locale,
});

function build(
    journal: SettlementJournalItem[],
    scope: "open" | "closed",
    locale: Locale = "en",
) {
    return buildSettlementSummaryText(
        journal,
        names,
        scope,
        intlFor(locale),
        now,
    );
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

const DIVIDER = "\n\n────────────────────\n\n";

describe("buildSettlementSummaryText", () => {
    it("writes the full Spanish summary with both payment directions and the saved shares", () => {
        const journal = newestFirst([
            expense("e1", "2026-11-01", "Súper", 4, 1.28),
            expense("e2", "2026-11-08", "Pan", 2, 0.72),
            debt("d1", "2026-11-03", "partner_debt", "Estacionamiento", 9),
            debt("d2", "2026-11-04", "gf_fronted", "I owe Brenda", 5),
            transfer("t1", "2026-11-06", "gf_paid", 3, "cine"),
            transfer("t2", "2026-11-12", "gf_received", 4, "súper"),
        ]);

        expect(build(journal, "open", "es")).toBe(
            [
                [
                    "🧾 *Cuenta 1 nov 2026 – hoy (22 nov 2026)*",
                    "",
                    "*Gastos compartidos*",
                    "    • (1 nov) Súper: $4.00",
                    "    • (8 nov) Pan: $2.00",
                    "",
                    "*Subtotal: $6.00*",
                ],
                [
                    "🌸 *Brenda a pagar*",
                    "    • Súper: *$1.28*",
                    "    • Pan: *$0.72*",
                    "",
                    "*Parte de Brenda en gastos compartidos: $2.00*",
                    "",
                    "*Pendientes adicionales*",
                    "    • Estacionamiento: $9.00",
                    "",
                    "*Subtotal de Brenda a pagar: $2.00 (gastos compartidos) + $9.00 (pendientes adicionales) = $11.00*",
                ],
                [
                    "🍔 *Alex debe a Brenda*",
                    "    • Le debo a Brenda: $5.00",
                    "",
                    "*Subtotal que Alex debe a Brenda: $5.00*",
                ],
                [
                    "💸 *Pagos realizados*",
                    "    • Alex pagó a Brenda: $3.00 (cine)",
                    "    • Brenda pagó a Alex: $4.00 (súper)",
                    "",
                    "*Total que Brenda pagó a Alex: $4.00*",
                    "*Total que Alex pagó a Brenda: $3.00*",
                ],
                [
                    "*Resumen*",
                    "    • Subtotal de Brenda (gastos compartidos + pendientes): $11.00",
                    "    • Alex debe a Brenda: $5.00",
                    "    • Brenda pagó a Alex durante este periodo: $4.00",
                    "    • Alex pagó a Brenda durante este periodo: $3.00",
                    "",
                    "*Fórmula*",
                    "Subtotal de Brenda − deuda de Alex con Brenda − pagos de Brenda a Alex + pagos de Alex a Brenda = saldo final",
                    "🟰 *$11.00 − $5.00 − $4.00 + $3.00 = $5.00*",
                    "",
                    "✅ *Resultado final: Brenda debe $5.00 MXN*",
                ],
            ]
                .map((section) => section.join("\n"))
                .join(DIVIDER),
        );
    });

    it("localizes the full accounting in English and agrees with the domain balance", () => {
        const journal = newestFirst([
            expense("e1", "2026-09-01", "Groceries", 1234.56, 395.06),
            expense("e2", "2026-09-04", "Dinner", 880.1, 281.63),
            debt("d1", "2026-09-05", "partner_debt", "Concert", 410.33),
            debt("d2", "2026-09-06", "gf_fronted", "Taxi", 99.99),
            transfer("t1", "2026-09-07", "gf_paid", 150.25),
            transfer("t2", "2026-09-08", "gf_received", 300.01),
        ]);
        const balance = balanceOf(journal);
        const text = build(journal, "closed");
        const amount = formatMxn(balance.amount);

        expect(balance.direction).toBe("she_owes");
        expect(text.split(DIVIDER)).toHaveLength(5);
        expect(text).toContain("🧾 *Settlement Sep 1, 2026 – Sep 8, 2026*");
        expect(text).toContain("    • (Sep 1) Groceries: $1,234.56");
        expect(text).toContain("    • Dinner: *$281.63*");
        expect(text).toContain("*Brenda's share of shared expenses: $676.69*");
        expect(text).toContain("*Subtotal Alex owes Brenda: $99.99*");
        expect(text).toContain("*Total Brenda paid Alex: $300.01*");
        expect(text).toContain("*Total Alex paid Brenda: $150.25*");
        expect(text).toContain(
            "Brenda's subtotal − Alex's debt to Brenda − payments from Brenda to Alex + payments from Alex to Brenda = final balance",
        );
        expect(text).toContain(
            `🟰 *$1,087.02 − $99.99 − $300.01 + $150.25 = ${amount}*`,
        );
        expect(lines(text).at(-1)).toBe(
            `✅ *Final outcome: Brenda owes ${amount} MXN*`,
        );
    });

    it("keeps the saved shares on each row when the default split rounds per expense", () => {
        const text = build(
            newestFirst([
                expense("e1", "2026-09-01", "Coffee", 1.05, 0.34),
                expense("e2", "2026-09-02", "Tea", 1.05, 0.34),
            ]),
            "closed",
        );
        expect(text).toContain("    • Coffee: *$0.34*");
        expect(text).toContain("    • Tea: *$0.34*");
        expect(text).toContain("*Brenda's share of shared expenses: $0.68*");
        expect(text).toContain("*Subtotal Brenda owes: $0.68*");
        expect(text).toContain("🟰 *$0.68 = $0.68*");
        expect(text).not.toMatch(/32%|Additional debts|💸|🍔/u);
    });

    it("omits the shared-expense group when only an additional debt is owed", () => {
        const text = build(
            [debt("d1", "2026-11-01", "partner_debt", "Books", 9)],
            "closed",
        );
        expect(text).toContain("*Additional debts*");
        expect(text).toContain("*Subtotal Brenda owes: $9.00*");
        expect(text).toContain("Brenda's subtotal (additional debts): $9.00");
        expect(text).not.toContain("shared expenses");
    });

    it("keeps the leading minus when a lone owner debt sets the balance", () => {
        const text = build(
            [debt("d1", "2026-11-01", "gf_fronted", "Taxi", 5)],
            "closed",
        );
        expect(text.split(DIVIDER)).toHaveLength(2);
        expect(text).toContain("−Alex's debt to Brenda = final balance");
        expect(text).toContain("🟰 *−$5.00 = −$5.00*");
        expect(text).toContain("✅ *Final outcome: Brenda receives $5.00 MXN*");
    });

    it("totals repeated payments in each direction and renders zero without a sign", () => {
        const text = build(
            newestFirst([
                transfer("t1", "2026-11-01", "gf_paid", 0.1),
                transfer("t2", "2026-11-02", "gf_paid", 0.2),
                transfer("t3", "2026-11-03", "gf_received", 0.3),
            ]),
            "open",
        );
        expect(text).toContain("*Total Brenda paid Alex: $0.30*");
        expect(text).toContain("*Total Alex paid Brenda: $0.30*");
        expect(text).toContain("🟰 *−$0.30 + $0.30 = $0.00*");
        expect(text).toContain("✅ *Final outcome: settled, $0.00 MXN*");
    });

    it("avoids a signed zero when the only debt rounds to zero cents", () => {
        const text = build(
            [debt("d1", "2026-11-01", "gf_fronted", "Taxi", 0.001)],
            "closed",
        );
        expect(text).toContain("−Alex's debt to Brenda = final balance");
        expect(text).toContain("🟰 *$0.00 = $0.00*");
    });

    it("uses the closed journal date without referring to today", () => {
        const journal = [expense("e1", "2026-09-03", "Lunch", 100, 32)];
        expect(lines(build(journal, "closed", "es"))[0]).toBe(
            "🧾 *Cuenta 3 sep 2026*",
        );
        expect(build(journal, "closed", "es")).not.toContain("hoy");
    });

    it("uses localized fallback text for a missing or blank owner name", () => {
        const journal = [transfer("t1", "2026-11-01", "gf_paid", 4)];
        const es = buildSettlementSummaryText(
            journal,
            { partner: "Sam", owner: "  " },
            "closed",
            intlFor("es"),
            now,
        );
        const en = buildSettlementSummaryText(
            journal,
            { partner: "Sam" },
            "closed",
            intlFor("en"),
            now,
        );
        expect(es).toContain("Titular de la cuenta pagó a Sam: $4.00");
        expect(en).toContain("Account holder paid Sam: $4.00");
    });

    it("gives a bare header and a settled outcome for no rows", () => {
        expect(build([], "open")).toBe(
            "🧾 *Settlement*\n\n✅ *Final outcome: settled, $0.00 MXN*",
        );
    });

    it("reverses the journal's order for rows that share a date", () => {
        const journal = [
            expense("e2", "2026-09-03", "Second", 100, 32),
            expense("e1", "2026-09-03", "First", 100, 32),
        ];
        const text = lines(build(journal, "open"));
        expect(text.indexOf("    • (Sep 3) First: $100.00")).toBeLessThan(
            text.indexOf("    • (Sep 3) Second: $100.00"),
        );
    });

    it("refuses a row kind it does not know", () => {
        const unknown = {
            ...base,
            kind: "refund",
            id: "x1",
            date: day("2026-09-01"),
        } as unknown as SettlementJournalItem;
        expect(() => build([unknown], "open")).toThrow(
            /Unhandled settlement row/,
        );
    });
});

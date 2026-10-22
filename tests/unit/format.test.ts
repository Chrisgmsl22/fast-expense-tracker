import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";

import type { Locale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";

import {
    formatBalance,
    formatBudgetTotal,
    formatMxn,
    formatMxnCompactAbs,
    formatMxnWhole,
    formatExpenseDate,
    formatMonthLabel,
    formatMonthName,
} from "@/lib/format";

describe("formatMonthName", () => {
    it("names the month alone, without shifting it a day", () => {
        expect(formatMonthName("2026-09", "en")).toBe("September");
        expect(formatMonthName("2027-01", "en")).toBe("January");
    });

    it("names the month in Spanish when the locale is es", () => {
        expect(formatMonthName("2026-09", "es")).toBe("septiembre");
        expect(formatMonthName("2027-01", "es")).toBe("enero");
    });
});

describe("formatBalance", () => {
    it.each([
        [6130, "$6,130.00"],
        [0, "$0.00"],
        [-1889.25, "+$1,889.25"],
    ])("formats %s as %s", (balance, text) => {
        expect(formatBalance(balance)).toBe(text);
    });
});

describe("formatMxnCompactAbs", () => {
    it.each([
        [270, "$270.00"],
        [250.5, "$250.50"],
        [0, "$0.00"],
        [999.6, "$1k"],
        [12000, "$12k"],
        [18400, "$18.4k"],
        [-1889.25, "$1.9k"],
    ])("shortens %s to %s", (amount, text) => {
        expect(formatMxnCompactAbs(amount)).toBe(text);
    });

    it("keeps a sub-1,000 breakdown adding up to the balance above it", () => {
        // charged 250.50 − paid 100 − redeemed 0 = 150.50.
        expect([250.5, 100, 0].map(formatMxnCompactAbs)).toEqual([
            "$250.50",
            "$100.00",
            "$0.00",
        ]);

        const shown = (n: number) =>
            Number(formatMxnCompactAbs(n).replace(/[$,]/g, ""));
        expect(shown(250.5) - shown(100) - shown(0)).toBe(150.5);
    });

    it("drops the sign, as its name says", () => {
        expect(formatMxnCompactAbs(-250.5)).toBe(formatMxnCompactAbs(250.5));
    });
});

describe("formatMxn", () => {
    it("formats an amount with thousands grouping and two decimals", () => {
        const s = formatMxn(1000);
        expect(s).toMatch(/1,000\.00/);
        expect(s).toContain("$");
    });

    it("formats zero and fractional amounts", () => {
        expect(formatMxn(0)).toMatch(/0\.00/);
        expect(formatMxn(1234.5)).toMatch(/1,234\.50/);
    });
});

describe("formatExpenseDate", () => {
    it.each([
        ["en", "May 15, 2026"],
        ["es", "15 may 2026"],
    ] as const)(
        "renders the stored CDMX calendar day from its 06:00Z instant in %s (no day shift)",
        (locale, text) => {
            expect(
                formatExpenseDate(new Date("2026-05-15T06:00:00Z"), locale),
            ).toBe(text);
        },
    );

    it.each([
        ["en", "Sep 1, 2026"],
        ["es", "1 sep 2026"],
    ] as const)(
        "keeps the first of the month on the first, without a zero pad, in %s",
        (locale, text) => {
            expect(
                formatExpenseDate(new Date("2026-09-01T06:00:00Z"), locale),
            ).toBe(text);
        },
    );
});

describe("formatMonthLabel", () => {
    it.each([
        ["en", "June 2026"],
        ["es", "junio de 2026"],
    ] as const)(
        "names the calendar month a `YYYY-MM` string stands for in %s",
        (locale, text) => {
            expect(formatMonthLabel("2026-06", locale)).toBe(text);
        },
    );

    it("does not shift January back into the previous year", () => {
        expect(formatMonthLabel("2026-01", "en")).toBe("January 2026");
        expect(formatMonthLabel("2026-01", "es")).toBe("enero de 2026");
    });
});

describe("formatMxnWhole", () => {
    it("drops the cents so a figure fits a donut's centre", () => {
        expect(formatMxnWhole(52465.22)).toMatch(/52,465/);
        expect(formatMxnWhole(52465.22)).not.toMatch(/\.22/);
    });

    it("rounds rather than truncating", () => {
        expect(formatMxnWhole(1234.6)).toMatch(/1,235/);
    });
});

describe("formatBudgetTotal", () => {
    const budgetT = (locale: Locale) =>
        createTranslator({
            locale,
            messages: MESSAGES[locale],
            namespace: "settings.budget",
        });

    it.each([
        [100, "Total 100%"],
        [90, "Total 90% · 10% left to assign"],
        [0, "Total 0% · 100% left to assign"],
        [115, "Total 115% · 15% over 100%"],
    ])("formats a total of %i in English", (total, line) => {
        expect(formatBudgetTotal(total, budgetT("en"))).toBe(line);
    });

    it.each([
        [100, "Total 100%"],
        [90, "Total 90% · falta asignar 10%"],
        [115, "Total 115% · 15% por encima de 100%"],
    ])("formats a total of %i in Spanish", (total, line) => {
        expect(formatBudgetTotal(total, budgetT("es"))).toBe(line);
    });
});

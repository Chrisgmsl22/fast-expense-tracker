import { describe, it, expect } from "vitest";

import {
    formatMxn,
    formatMxnWhole,
    formatExpenseDate,
    formatMonthLabel,
} from "@/lib/format";

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
    it("renders the stored CDMX calendar day from its 06:00Z instant (no day shift)", () => {
        const s = formatExpenseDate(new Date("2026-05-15T06:00:00Z"));
        expect(s).toMatch(/15/);
        expect(s).toMatch(/2026/);
    });
});

describe("formatMonthLabel", () => {
    it("names the calendar month a `YYYY-MM` string stands for", () => {
        expect(formatMonthLabel("2026-06")).toBe("June 2026");
    });

    it("does not shift January back into the previous year", () => {
        expect(formatMonthLabel("2026-01")).toBe("January 2026");
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

// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
    cdmxCalendarDateToUtc,
    getCurrentMonthCdmx,
    getMonthProgress,
    getMonthRangeUtc,
    isValidMonth,
    shiftMonth,
    toDateInputValue,
} from "@/lib/dates";

describe("isValidMonth", () => {
    it.each([
        ["2026-05", true],
        ["2026-01", true],
        ["2026-12", true],
        ["2026-13", false],
        ["2026-00", false],
        ["2026-5", false],
        ["26-05", false],
        ["2026/05", false],
        ["", false],
        ["nope", false],
    ])("%s → %s", (input, expected) => {
        expect(isValidMonth(input)).toBe(expected);
    });
});

describe("getMonthRangeUtc", () => {
    it("returns a CDMX-aligned half-open range for a mid-year month", () => {
        const { start, end } = getMonthRangeUtc("2026-05");
        expect(start.toISOString()).toBe("2026-05-01T06:00:00.000Z");
        expect(end.toISOString()).toBe("2026-06-01T06:00:00.000Z");
    });

    it("rolls the year over for December", () => {
        const { start, end } = getMonthRangeUtc("2026-12");
        expect(start.toISOString()).toBe("2026-12-01T06:00:00.000Z");
        expect(end.toISOString()).toBe("2027-01-01T06:00:00.000Z");
    });
});

describe("getCurrentMonthCdmx", () => {
    it("stays in the prior month before CDMX crosses midnight", () => {
        // 03:00Z is still 21:00 the previous day in CDMX (UTC-6).
        expect(getCurrentMonthCdmx(new Date("2026-06-01T03:00:00Z"))).toBe(
            "2026-05",
        );
    });

    it("advances once CDMX reaches the 1st at midnight", () => {
        // 06:00Z = 00:00 CDMX on the 1st.
        expect(getCurrentMonthCdmx(new Date("2026-06-01T06:00:00Z"))).toBe(
            "2026-06",
        );
    });

    it("returns the plain month mid-month", () => {
        expect(getCurrentMonthCdmx(new Date("2026-06-15T12:00:00Z"))).toBe(
            "2026-06",
        );
    });

    it("stays in the prior year before CDMX crosses into January", () => {
        // 2027-01-01T03:00Z is still 2026-12-31 21:00 in CDMX.
        expect(getCurrentMonthCdmx(new Date("2027-01-01T03:00:00Z"))).toBe(
            "2026-12",
        );
    });
});

describe("toDateInputValue", () => {
    it("formats a stored CDMX-midnight instant back to its calendar date", () => {
        // What cdmxCalendarDateToUtc produces for 2026-05-15 is stored at 06:00Z.
        expect(toDateInputValue(new Date("2026-05-15T06:00:00Z"))).toBe(
            "2026-05-15",
        );
    });

    it("round-trips with cdmxCalendarDateToUtc", () => {
        const stored = cdmxCalendarDateToUtc(new Date("2026-12-31T00:00:00Z"));
        expect(toDateInputValue(stored)).toBe("2026-12-31");
    });
});

describe("getMonthProgress", () => {
    it("counts up to today's CDMX day in the current month", () => {
        // 2026-06-15 12:00Z = the 15th in CDMX; June has 30 days.
        const p = getMonthProgress("2026-06", new Date("2026-06-15T12:00:00Z"));
        expect(p).toEqual({ daysInMonth: 30, daysElapsed: 15, daysLeft: 15 });
    });

    it("treats a past month as fully elapsed (0 left)", () => {
        const p = getMonthProgress("2026-05", new Date("2026-06-15T12:00:00Z"));
        expect(p).toEqual({ daysInMonth: 31, daysElapsed: 31, daysLeft: 0 });
    });

    it("treats a future month as not started (0 elapsed)", () => {
        const p = getMonthProgress("2026-07", new Date("2026-06-15T12:00:00Z"));
        expect(p).toEqual({ daysInMonth: 31, daysElapsed: 0, daysLeft: 31 });
    });

    it("respects the CDMX boundary on the 1st (still prior day before 06:00Z)", () => {
        // 2026-06-01T03:00Z is still May 31 in CDMX → May is the current month.
        const p = getMonthProgress("2026-05", new Date("2026-06-01T03:00:00Z"));
        expect(p).toEqual({ daysInMonth: 31, daysElapsed: 31, daysLeft: 0 });
    });

    it("handles February day-count", () => {
        const p = getMonthProgress("2026-02", new Date("2026-02-10T12:00:00Z"));
        expect(p).toEqual({ daysInMonth: 28, daysElapsed: 10, daysLeft: 18 });
    });
});

describe("shiftMonth", () => {
    it.each([
        ["2026-06", -1, "2026-05"],
        ["2026-06", 1, "2026-07"],
        ["2026-01", -1, "2025-12"],
        ["2026-12", 1, "2027-01"],
        ["2026-06", -6, "2025-12"],
    ])("%s %+d → %s", (month, delta, expected) => {
        expect(shiftMonth(month, delta)).toBe(expected);
    });
});

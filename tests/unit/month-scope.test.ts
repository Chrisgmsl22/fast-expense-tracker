// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
    MONTH_COOKIE,
    monthCookieString,
    resolveMonth,
} from "@/lib/month-scope";

const NOW = new Date("2026-09-15T12:00:00Z");

describe("resolveMonth — URL, then store, then now", () => {
    it("takes the URL parameter first, so a link stays linkable", () => {
        expect(
            resolveMonth({ param: "2026-08", stored: "2026-06", now: NOW }),
        ).toBe("2026-08");
    });

    it("falls back to the remembered month, which survives navigation", () => {
        expect(resolveMonth({ stored: "2026-06", now: NOW })).toBe("2026-06");
    });

    it("falls back to the current month when there is neither", () => {
        expect(resolveMonth({ now: NOW })).toBe("2026-09");
    });

    it("ignores a malformed URL parameter rather than trusting it", () => {
        expect(
            resolveMonth({ param: "not-a-month", stored: "2026-06", now: NOW }),
        ).toBe("2026-06");
    });

    it("ignores a malformed cookie — it is user-editable input", () => {
        expect(resolveMonth({ stored: "2026-13", now: NOW })).toBe("2026-09");
    });

    it("treats an empty ?month= as absent, so the memory still applies", () => {
        expect(resolveMonth({ param: "", stored: "2026-06", now: NOW })).toBe(
            "2026-06",
        );
    });

    it("falls back to today when both the param and the cookie are junk", () => {
        expect(
            resolveMonth({ param: "2026-99", stored: "june", now: NOW }),
        ).toBe("2026-09");
    });
});

describe("resolveMonth — never a month that has not happened", () => {
    it("clamps a future URL parameter to the current month, not the cookie", () => {
        // The link asked for a later month; the nearest month that exists is
        // now. Falling back to the cookie would show March under a December URL.
        expect(
            resolveMonth({ param: "2026-11", stored: "2026-06", now: NOW }),
        ).toBe("2026-09");
        expect(resolveMonth({ param: "2027-01", now: NOW })).toBe("2026-09");
    });

    it("ignores a future cookie, however it was written", () => {
        expect(resolveMonth({ stored: "2026-10", now: NOW })).toBe("2026-09");
        expect(
            resolveMonth({ param: "2026-12", stored: "2026-10", now: NOW }),
        ).toBe("2026-09");
    });

    it("still resolves a past parameter and a past cookie to themselves", () => {
        expect(resolveMonth({ param: "2025-12", now: NOW })).toBe("2025-12");
        expect(resolveMonth({ stored: "2026-08", now: NOW })).toBe("2026-08");
    });

    it("still resolves the current month to itself", () => {
        expect(
            resolveMonth({ param: "2026-09", stored: "2026-06", now: NOW }),
        ).toBe("2026-09");
        expect(resolveMonth({ stored: "2026-09", now: NOW })).toBe("2026-09");
    });

    it("judges the future by the CDMX clock, not UTC", () => {
        // 03:00Z on 1 October is still 30 September in CDMX (UTC-6).
        const lateSeptember = new Date("2026-10-01T03:00:00Z");
        expect(resolveMonth({ param: "2026-10", now: lateSeptember })).toBe(
            "2026-09",
        );
    });

    it("opens the new month at CDMX midnight, not later", () => {
        // 06:00Z on 1 October is 00:00 in CDMX: October has started. An offset
        // larger than six hours would still call it September.
        const cdmxMidnight = new Date("2026-10-01T06:00:00Z");
        expect(resolveMonth({ param: "2026-10", now: cdmxMidnight })).toBe(
            "2026-10",
        );
        // One second earlier it is still September.
        expect(
            resolveMonth({
                param: "2026-10",
                now: new Date("2026-10-01T05:59:59Z"),
            }),
        ).toBe("2026-09");
    });
});

describe("monthCookieString", () => {
    it("is a session cookie: no Max-Age, so it dies with the browser", () => {
        const cookie = monthCookieString("2026-08")!;
        expect(cookie).toContain(`${MONTH_COOKIE}=2026-08`);
        expect(cookie).toContain("path=/");
        expect(cookie).toContain("SameSite=Lax");
        expect(cookie.toLowerCase()).not.toContain("max-age");
        expect(cookie.toLowerCase()).not.toContain("expires");
    });

    it("refuses a value that is not a month", () => {
        // The value lands in `document.cookie`, so it is checked where it is
        // WRITTEN — a later caller cannot make the read-side guard the only one.
        expect(monthCookieString("2026-13")).toBeNull();
        expect(monthCookieString("")).toBeNull();
        expect(monthCookieString("2026-08; Domain=evil.example")).toBeNull();
    });
});

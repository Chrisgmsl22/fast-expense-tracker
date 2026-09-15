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
});

describe("monthCookieString", () => {
    it("is a session cookie: no Max-Age, so it dies with the browser", () => {
        const cookie = monthCookieString("2026-08");
        expect(cookie).toContain(`${MONTH_COOKIE}=2026-08`);
        expect(cookie).toContain("path=/");
        expect(cookie).toContain("SameSite=Lax");
        expect(cookie.toLowerCase()).not.toContain("max-age");
        expect(cookie.toLowerCase()).not.toContain("expires");
    });
});

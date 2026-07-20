import { describe, it, expect } from "vitest";

import {
    CARD_PALETTE,
    CASH_COLOR,
    isValidHex,
    normalizeHex,
} from "@/lib/palette";

describe("isValidHex", () => {
    it("accepts a 6-digit #RRGGBB colour", () => {
        expect(isValidHex("#6b7280")).toBe(true);
        expect(isValidHex("#FFFFFF")).toBe(true);
    });

    it("rejects a value without the leading #", () => {
        expect(isValidHex("6b7280")).toBe(false);
    });

    it("rejects a 3-digit shorthand hex", () => {
        expect(isValidHex("#fff")).toBe(false);
    });

    it("rejects non-hex characters", () => {
        expect(isValidHex("#ggg000")).toBe(false);
    });

    it("rejects an empty string", () => {
        expect(isValidHex("")).toBe(false);
    });
});

describe("normalizeHex", () => {
    it("trims surrounding whitespace and lowercases", () => {
        expect(normalizeHex("  #6B7280  ")).toBe("#6b7280");
    });
});

describe("CARD_PALETTE", () => {
    it("includes the five seeded card colours", () => {
        const hexes = CARD_PALETTE.map((s) => s.hex);
        for (const seed of [
            "#6b7280", // Amex Platinum
            "#ca8a04", // Amex Gold
            "#9333ea", // NU
            "#2563eb", // BBVA
            "#16a34a", // Cash
        ]) {
            expect(hexes).toContain(seed);
        }
    });

    it("only contains valid, normalized hex values", () => {
        for (const swatch of CARD_PALETTE) {
            expect(isValidHex(swatch.hex)).toBe(true);
            expect(normalizeHex(swatch.hex)).toBe(swatch.hex);
            expect(swatch.name.length).toBeGreaterThan(0);
        }
    });

    it("has no duplicate hex values", () => {
        const hexes = CARD_PALETTE.map((s) => s.hex);
        expect(new Set(hexes).size).toBe(hexes.length);
    });
});

describe("CASH_COLOR", () => {
    it("is the locked green used app-wide for cash", () => {
        expect(CASH_COLOR).toBe("#16a34a");
    });
});

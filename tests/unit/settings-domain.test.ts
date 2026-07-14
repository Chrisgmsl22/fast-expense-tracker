// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
    DEFAULT_SHARE_PERCENTAGE,
    SOLO_PARTNER_FALLBACK,
    resolvePartnerName,
    resolveSplitRule,
    toUserSettings,
} from "@/lib/domain/settings";

describe("toUserSettings (the accessor's default mapping)", () => {
    it("applies Solo defaults when the user has no settings row", () => {
        expect(toUserSettings(null)).toEqual({
            sharesExpenses: false,
            partnerName: null,
            defaultSharePercentage: DEFAULT_SHARE_PERCENTAGE,
        });
    });

    it("passes through a stored row unchanged", () => {
        expect(
            toUserSettings({
                sharesExpenses: true,
                partnerName: "Brenda",
                defaultSharePercentage: 0.5,
            }),
        ).toEqual({
            sharesExpenses: true,
            partnerName: "Brenda",
            defaultSharePercentage: 0.5,
        });
    });
});

describe("resolvePartnerName", () => {
    it("returns the trimmed stored name", () => {
        expect(resolvePartnerName("  Brenda  ")).toBe("Brenda");
    });

    it("falls back to a neutral label for null / empty", () => {
        expect(resolvePartnerName(null)).toBe(SOLO_PARTNER_FALLBACK);
        expect(resolvePartnerName("   ")).toBe(SOLO_PARTNER_FALLBACK);
        expect(resolvePartnerName(undefined)).toBe(SOLO_PARTNER_FALLBACK);
    });
});

describe("resolveSplitRule", () => {
    it("stores the trimmed name + share as a fraction when sharing is on", () => {
        expect(
            resolveSplitRule({
                sharesExpenses: true,
                partnerName: "  Brenda  ",
                sharePercentage: 68,
            }),
        ).toEqual({
            sharesExpenses: true,
            partnerName: "Brenda",
            defaultSharePercentage: 0.68,
        });
    });

    it("preserves the partner name on disable (lossless restore, ADR-0021)", () => {
        expect(
            resolveSplitRule({
                sharesExpenses: false,
                partnerName: "Brenda",
                sharePercentage: 68,
            }),
        ).toEqual({
            sharesExpenses: false,
            partnerName: "Brenda",
            defaultSharePercentage: 0.68,
        });
    });

    it("stores null when the name is genuinely blank", () => {
        expect(
            resolveSplitRule({
                sharesExpenses: false,
                partnerName: "   ",
                sharePercentage: 100,
            }).partnerName,
        ).toBeNull();
    });
});

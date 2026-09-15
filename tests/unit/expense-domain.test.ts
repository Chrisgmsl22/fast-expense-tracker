import { describe, expect, it } from "vitest";

import { computeActualExpenditure } from "@/lib/domain/expense";

describe("computeActualExpenditure", () => {
    it("returns the full amount when not shared", () => {
        expect(
            computeActualExpenditure({
                amount: 1000,
                isShared: false,
                yourPercentage: 1,
            }),
        ).toBe(1000);
    });

    it("never splits an unshared expense, even if a percentage rides along", () => {
        expect(
            computeActualExpenditure({
                amount: 1000,
                isShared: false,
                yourPercentage: 0.5,
            }),
        ).toBe(1000);
    });

    it("applies the share when shared (1000 @ 0.68 → 680)", () => {
        expect(
            computeActualExpenditure({
                amount: 1000,
                isShared: true,
                yourPercentage: 0.68,
            }),
        ).toBe(680);
    });

    it("returns 0 when the user's share is 0%", () => {
        expect(
            computeActualExpenditure({
                amount: 1000,
                isShared: true,
                yourPercentage: 0,
            }),
        ).toBe(0);
    });

    it("rounds to the cent — money is never stored sub-cent", () => {
        // 33.33 × 0.68 = 22.6644, stored as 22.66. A sub-cent remainder cannot
        // be displayed, so each panel used to round for itself and the same
        // expense read differently depending on which rows shared its total.
        expect(
            computeActualExpenditure({
                amount: 33.33,
                isShared: true,
                yourPercentage: 0.68,
            }),
        ).toBe(22.66);
    });

    it("leaves no float dust behind", () => {
        // 1200 × 0.68 is 816.0000000000001 in IEEE 754 — the real "Repair" row,
        // whose partner share rendered $383.99 in one view and $384.00 in another.
        expect(
            computeActualExpenditure({
                amount: 1200,
                isShared: true,
                yourPercentage: 0.68,
            }),
        ).toBe(816);
    });
});

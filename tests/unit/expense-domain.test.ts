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

    it("does not round — returns the raw float product (open decision)", () => {
        // 33.33 * 0.68 = 22.6644 — documents current no-rounding behavior.
        expect(
            computeActualExpenditure({
                amount: 33.33,
                isShared: true,
                yourPercentage: 0.68,
            }),
        ).toBeCloseTo(22.6644, 4);
    });
});

import { describe, expect, it } from "vitest";

import {
    computeActualExpenditure,
    isPartnerPaymentAutoLabel,
    movesSettlementBalance,
    partnerPaymentDescription,
    partnerShareOf,
} from "@/lib/domain/expense";
import { partnerShareTotal } from "@/lib/domain/movement";

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
        // 33.33 × 0.68 = 22.6644, stored as 22.66. A sub-cent remainder cannot be
        // displayed, so each panel used to round for itself.
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

/**
 * The predicate the closed-cycle freeze refuses on, and the one the settlement service
 * counts with. If they disagree, the app freezes rows no cycle counted.
 */
describe("movesSettlementBalance", () => {
    const solo = {
        amount: 800,
        actualExpenditure: 800,
        isPartnerPayment: false,
    };

    it("is false for a solo expense — a cycle counts nothing of it", () => {
        expect(movesSettlementBalance(solo)).toBe(false);
    });

    it("is true for a shared expense — her share is in the cycle", () => {
        expect(
            movesSettlementBalance({
                amount: 1000,
                actualExpenditure: 680,
                isPartnerPayment: false,
            }),
        ).toBe(true);
    });

    it("is true for a payment, whose amount and share are equal by design", () => {
        // A payment carries no partner share at all: it counts because it draws
        // the balance down, on the "you paid her" side.
        expect(
            movesSettlementBalance({ ...solo, isPartnerPayment: true }),
        ).toBe(true);
    });

    it("ignores sub-cent Float drift, the way the settlement sum does", () => {
        expect(
            movesSettlementBalance({
                amount: 800,
                actualExpenditure: 799.999,
                isPartnerPayment: false,
            }),
        ).toBe(false);
    });

    it("agrees with the figure the settlement actually sums", () => {
        const rows = [
            { amount: 1000, actualExpenditure: 680 },
            { amount: 800, actualExpenditure: 800 },
        ];
        // The total is built from the same per-row figure the predicate tests,
        // so the rows that count and the rows that freeze are one set.
        expect(partnerShareTotal(rows)).toBe(partnerShareOf(rows[0]!));
    });
});

describe("isPartnerPaymentAutoLabel", () => {
    it("recognises the label it generates", () => {
        expect(
            isPartnerPaymentAutoLabel(
                partnerPaymentDescription(null, "Brenda"),
            ),
        ).toBe(true);
    });

    it("recognises it whatever partner name it was generated with", () => {
        // The journal reads this to decide "auto-label or the user's own note".
        // Matching the CURRENT name would turn every pre-rename label into a
        // note, and the edit form would then save the stale name as real text.
        for (const name of ["Brenda", "Ana", "B"]) {
            expect(
                isPartnerPaymentAutoLabel(
                    partnerPaymentDescription(null, name),
                ),
            ).toBe(true);
        }
    });

    it("leaves a real note alone", () => {
        expect(isPartnerPaymentAutoLabel("Rent for September")).toBe(false);
    });
});

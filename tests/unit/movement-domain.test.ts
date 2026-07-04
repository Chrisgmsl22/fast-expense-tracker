import { describe, expect, it } from "vitest";

import {
    computeFeedTotals,
    partnerOwesYou,
    partnerShareTotal,
} from "@/lib/domain/movement";

const shared = (amount: number, yourPct: number) => ({
    amount,
    actualExpenditure: amount * yourPct,
});

describe("partnerShareTotal", () => {
    it("sums the non-yours slice of each shared expense", () => {
        // 1000 @ 68% → partner 320; 500 @ 68% → partner 160 ⇒ 480
        expect(partnerShareTotal([shared(1000, 0.68), shared(500, 0.68)])).toBe(
            480,
        );
    });

    it("contributes 0 for an unshared expense (amount === your share)", () => {
        expect(
            partnerShareTotal([{ amount: 1000, actualExpenditure: 1000 }]),
        ).toBe(0);
    });

    it("is 0 for no expenses", () => {
        expect(partnerShareTotal([])).toBe(0);
    });
});

describe("partnerOwesYou", () => {
    it("is her share when nothing has been paid back", () => {
        expect(partnerOwesYou([shared(1000, 0.68)], 0)).toBe(320);
    });

    it("draws down by funded-by-partner card payments (fully settled → 0)", () => {
        expect(partnerOwesYou([shared(1000, 0.68)], 320)).toBe(0);
    });

    it("reads high on a netting week until the offsetting transfer is logged", () => {
        // She owes 320 for her share; they netted so she sent only 120.
        // The reminder honestly still shows 200 — an estimate, not a balance.
        expect(partnerOwesYou([shared(1000, 0.68)], 120)).toBe(200);
    });

    it("floors at 0 — never reports a negative 'she owes you'", () => {
        expect(partnerOwesYou([shared(1000, 0.68)], 500)).toBe(0);
    });
});

describe("computeFeedTotals", () => {
    const groceries = {
        amount: 1000,
        actualExpenditure: 680,
        category: { slug: "groceries" },
    };
    const savings = {
        amount: 5000,
        actualExpenditure: 5000,
        category: { slug: "savings" },
    };

    it("splits consumption from the savings transfer", () => {
        const t = computeFeedTotals([groceries, savings], 0);
        expect(t.charged).toBe(1000); // savings excluded from charged
        expect(t.whatIReallySpent).toBe(680);
        expect(t.setAside).toBe(5000);
    });

    it("adds transfers to the partner into the total, not into spend", () => {
        const t = computeFeedTotals([groceries], 100);
        expect(t.whatIReallySpent).toBe(680); // transfer not counted as spend
        expect(t.paidToPartner).toBe(100);
        expect(t.total).toBe(780); // 680 spent + 0 saved + 100 paid
    });

    it("total = spent + set aside + paid to partner", () => {
        const t = computeFeedTotals([groceries, savings], 100);
        expect(t.total).toBe(680 + 5000 + 100);
    });

    it("is all zeros for an empty month", () => {
        expect(computeFeedTotals([], 0)).toEqual({
            charged: 0,
            whatIReallySpent: 0,
            setAside: 0,
            paidToPartner: 0,
            total: 0,
        });
    });
});

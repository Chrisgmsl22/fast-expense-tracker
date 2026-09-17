import { describe, expect, it } from "vitest";

import {
    cardPaymentInputSchema,
    transferInputSchema,
} from "@/lib/schemas/movement";

describe("cardPaymentInputSchema", () => {
    it("accepts a valid card payment and coerces the amount", () => {
        const res = cardPaymentInputSchema.safeParse({
            date: "2026-06-20",
            amount: "1000",
            cardId: "card_1",
        });
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.amount).toBe(1000);
    });

    it("requires a card", () => {
        const res = cardPaymentInputSchema.safeParse({
            date: "2026-06-20",
            amount: "500",
            cardId: "",
        });
        expect(res.success).toBe(false);
    });

    it("rejects a non-positive amount", () => {
        const res = cardPaymentInputSchema.safeParse({
            date: "2026-06-20",
            amount: "0",
            cardId: "card_1",
        });
        expect(res.success).toBe(false);
    });
});

describe("transferInputSchema", () => {
    it("accepts a valid transfer with an optional note", () => {
        const res = transferInputSchema.safeParse({
            date: "2026-06-20",
            amount: "300",
            note: "netted week",
        });
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.amount).toBe(300);
    });

    it("defaults direction to gf_paid when omitted", () => {
        const res = transferInputSchema.safeParse({
            date: "2026-06-20",
            amount: "300",
        });
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.direction).toBe("gf_paid");
    });

    it("accepts gf_received as a direction", () => {
        const res = transferInputSchema.safeParse({
            date: "2026-06-20",
            amount: "300",
            direction: "gf_received",
        });
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.direction).toBe("gf_received");
    });

    it("rejects a negative amount", () => {
        const res = transferInputSchema.safeParse({
            date: "2026-06-20",
            amount: "-5",
        });
        expect(res.success).toBe(false);
    });

    describe("funding source (spec 0007 §3.1)", () => {
        const transfer = (over: Record<string, unknown> = {}) => ({
            date: "2026-06-20",
            amount: "300",
            ...over,
        });

        it("defaults to income when omitted, so today's behaviour is unchanged", () => {
            const res = transferInputSchema.safeParse(transfer());
            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data.fundedFrom).toBe("income");
        });

        it("accepts savings on money you send", () => {
            const res = transferInputSchema.safeParse(
                transfer({ fundedFrom: "savings" }),
            );
            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data.fundedFrom).toBe("savings");
        });

        it("rejects reimbursed — it is Health-only and a transfer has no category", () => {
            // §3.3. The form never offers it; this is the guard for every other
            // route in.
            const res = transferInputSchema.safeParse(
                transfer({ fundedFrom: "reimbursed" }),
            );
            expect(res.success).toBe(false);
        });

        it("rejects an unknown value", () => {
            const res = transferInputSchema.safeParse(
                transfer({ fundedFrom: "vibes" }),
            );
            expect(res.success).toBe(false);
        });

        it("rejects savings on money she sent you", () => {
            // Money coming in is funded by nothing of yours.
            const res = transferInputSchema.safeParse(
                transfer({ direction: "gf_received", fundedFrom: "savings" }),
            );
            expect(res.success).toBe(false);
            if (res.success) return;
            expect(
                res.error.issues.some((i) => i.path[0] === "fundedFrom"),
            ).toBe(true);
        });

        it("still accepts an inbound transfer funded from income", () => {
            const res = transferInputSchema.safeParse(
                transfer({ direction: "gf_received" }),
            );
            expect(res.success).toBe(true);
        });
    });
});

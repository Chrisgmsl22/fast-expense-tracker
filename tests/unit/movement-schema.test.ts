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
            fundedByPartner: true,
        });
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.amount).toBe(1000);
        expect(res.data.fundedByPartner).toBe(true);
    });

    it("defaults fundedByPartner to false when omitted", () => {
        const res = cardPaymentInputSchema.safeParse({
            date: "2026-06-20",
            amount: "500",
            cardId: "card_1",
        });
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.fundedByPartner).toBe(false);
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

    it("rejects a negative amount", () => {
        const res = transferInputSchema.safeParse({
            date: "2026-06-20",
            amount: "-5",
        });
        expect(res.success).toBe(false);
    });
});

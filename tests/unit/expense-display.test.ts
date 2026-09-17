import { describe, expect, it } from "vitest";

import { expenseCardLabel, PARTNER_PAYMENT_COLOR } from "@/lib/expense-display";
import { CASH_COLOR } from "@/lib/palette";

const card = { name: "BBVA", color: "#2563eb" };

describe("expenseCardLabel", () => {
    it("never prints Cash for a payment you sent the partner", () => {
        // A payment has no `cardId`: a transfer leaves a bank account. A plain
        // `?? "Cash"` fallback puts BUG-1's symptom back on screen.
        const label = expenseCardLabel(
            { isPartnerPayment: true, card: null },
            "Brenda",
        );

        expect(label.name).toBe("Paid Brenda");
        expect(label.name).not.toMatch(/cash/i);
        expect(label.color).toBe(PARTNER_PAYMENT_COLOR);
    });

    it("ignores a stray card on a payment row", () => {
        // Belt and braces: the write paths keep `cardId` null, but the label
        // must not start naming her card if one ever survives.
        const label = expenseCardLabel(
            { isPartnerPayment: true, card },
            "Brenda",
        );

        expect(label.name).toBe("Paid Brenda");
    });

    it("still says Cash for a genuine cash purchase", () => {
        const label = expenseCardLabel(
            { isPartnerPayment: false, card: null },
            "Brenda",
        );

        expect(label).toEqual({ name: "Cash", color: CASH_COLOR });
    });

    it("names the card on an ordinary card purchase", () => {
        const label = expenseCardLabel(
            { isPartnerPayment: false, card },
            "Brenda",
        );

        expect(label).toEqual({ name: "BBVA", color: card.color });
    });
});

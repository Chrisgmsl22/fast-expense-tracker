import { describe, expect, it } from "vitest";

import {
    expenseCardLabel,
    subcategoryLabel,
    PARTNER_PAYMENT_COLOR,
} from "@/lib/expense-display";
import { CASH_COLOR } from "@/lib/palette";

const card = { name: "BBVA", color: "#2563eb" };

describe("expenseCardLabel", () => {
    it("never prints Cash for a payment you sent the partner", () => {
        // A fronted row has no `cardId` because HER card moved. A plain
        // `?? "Cash"` fallback puts the word Cash on screen next to a debt —
        // which is exactly what BUG-1 looked like, so a reader would reasonably
        // conclude the bug is back even though the totals are right.
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

describe("subcategoryLabel", () => {
    it("reads the seeded payment subcategory as 'I owed {partner}'", () => {
        // Presentation only — nothing is renamed in the database, so there is
        // no duplicate-on-reseed hazard to guard against.
        expect(subcategoryLabel("Covered for me", "Brenda")).toBe(
            "I owed Brenda",
        );
    });

    it("follows the configured partner name instead of going stale", () => {
        expect(subcategoryLabel("Covered for me", "Ana")).toBe("I owed Ana");
    });

    it("stays partner-neutral when nobody is configured", () => {
        // A solo user has no one to owe.
        expect(subcategoryLabel("Covered for me", null)).toBe(
            "I owed my partner",
        );
        expect(subcategoryLabel("Covered for me", "   ")).toBe(
            "I owed my partner",
        );
    });

    it("leaves every other subcategory exactly as stored", () => {
        expect(subcategoryLabel("Restaurants", "Brenda")).toBe("Restaurants");
    });

    it("lets a user's own rename win over the computed default", () => {
        // The computed label is keyed on the SEEDED name, so once someone
        // renames this subcategory their choice is what shows (CHORE-8.c).
        expect(subcategoryLabel("Her stuff", "Brenda")).toBe("Her stuff");
    });
});

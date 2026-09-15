import { describe, expect, it } from "vitest";

import { expenseCardLabel, FRONTED_COLOR } from "@/lib/expense-display";
import { CASH_COLOR } from "@/lib/palette";

const card = { name: "BBVA", color: "#2563eb" };

describe("expenseCardLabel", () => {
    it("never prints 'Cash' for a debt the partner covered", () => {
        // A fronted row has no `cardId` because HER card moved. A plain
        // `?? "Cash"` fallback puts the word Cash on screen next to a debt —
        // which is exactly what BUG-1 looked like, so a reader would reasonably
        // conclude the bug is back even though the totals are right.
        const label = expenseCardLabel(
            { isFronted: true, card: null },
            "Brenda",
        );

        expect(label.name).toBe("Covered by Brenda");
        expect(label.name).not.toMatch(/cash/i);
        expect(label.color).toBe(FRONTED_COLOR);
    });

    it("ignores a stray card on a fronted row", () => {
        // Belt and braces: the write paths keep `cardId` null, but the label
        // must not start naming her card if one ever survives.
        const label = expenseCardLabel({ isFronted: true, card }, "Brenda");

        expect(label.name).toBe("Covered by Brenda");
    });

    it("still says Cash for a genuine cash purchase", () => {
        const label = expenseCardLabel(
            { isFronted: false, card: null },
            "Brenda",
        );

        expect(label).toEqual({ name: "Cash", color: CASH_COLOR });
    });

    it("names the card on an ordinary card purchase", () => {
        const label = expenseCardLabel({ isFronted: false, card }, "Brenda");

        expect(label).toEqual({ name: "BBVA", color: card.color });
    });
});

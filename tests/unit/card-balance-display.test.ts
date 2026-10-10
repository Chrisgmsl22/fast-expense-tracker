import { describe, expect, it } from "vitest";

import {
    cardTypeLabel,
    namesInState,
    owedBreakdown,
    stateLabel,
    type CardBalanceView,
} from "@/components/cards/card-balance-display";

const view = (
    over: Partial<CardBalanceView> & Pick<CardBalanceView, "name">,
): CardBalanceView => ({
    id: over.name,
    color: "#000000",
    type: "credit",
    opening: 0,
    charged: 0,
    paid: 0,
    redeemed: 0,
    balance: 0,
    state: "paid",
    ...over,
});

describe("stateLabel", () => {
    it.each([
        ["owed", "Owed"],
        ["paid", "Paid in full"],
        ["credit", "Card owes you"],
    ] as const)("labels %s as %s", (state, label) => {
        expect(stateLabel(state)).toBe(label);
    });

    it("names the month on an owed balance", () => {
        expect(stateLabel("owed", "September")).toBe(
            "Owed at end of September",
        );
        expect(stateLabel("paid", "September")).toBe("Paid in full");
    });
});

describe("cardTypeLabel", () => {
    it("capitalises the stored type", () => {
        expect(cardTypeLabel("credit")).toBe("Credit");
    });
});

describe("owedBreakdown and namesInState", () => {
    const cards = [
        view({ name: "BBVA", balance: 6130, state: "owed" }),
        view({ name: "NU", balance: 0, state: "paid" }),
        view({ name: "Plat", balance: -10, state: "credit" }),
        view({ name: "Gold", balance: 1215.6, state: "owed" }),
        view({ name: "Oro", balance: -5, state: "credit" }),
    ];

    it("lists only the cards that are owed, with their balances", () => {
        expect(owedBreakdown(cards)).toBe("BBVA $6,130.00 + Gold $1,215.60");
    });

    it("names only the cards in the given state", () => {
        expect(namesInState(cards, "credit")).toBe("Plat, Oro");
        expect(namesInState(cards, "owed")).toBe("BBVA, Gold");
    });
});

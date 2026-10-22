import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";

import { MESSAGES } from "@/i18n/messages";

import {
    balanceFootnote,
    breakdownInState,
    cardTypeLabel,
    headlineState,
    isSettled,
    stateLabel,
    type CardBalanceView,
} from "@/components/cards/card-balance-display";

const t = createTranslator({
    locale: "en",
    messages: MESSAGES.en,
    namespace: "money.cards",
});
const tEs = createTranslator({
    locale: "es",
    messages: MESSAGES.es,
    namespace: "money.cards",
});

const view = (
    over: Partial<CardBalanceView> & Pick<CardBalanceView, "name">,
): CardBalanceView => ({
    id: over.name,
    color: "#000000",
    type: "credit",
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
        ["credit", "Paid more than charged"],
    ] as const)("labels %s as %s", (state, label) => {
        expect(stateLabel(state, t)).toBe(label);
    });

    it("names the month an owed or overpaid balance belongs to", () => {
        expect(stateLabel("owed", t, "September")).toBe("Owed for September");
        expect(stateLabel("credit", t, "October")).toBe(
            "Paid more than charged in October",
        );
        expect(stateLabel("paid", t, "September")).toBe("Paid in full");
    });

    it("names the month on an untouched card", () => {
        expect(stateLabel("untouched", t)).toBe("No activity");
        expect(stateLabel("untouched", t, "March")).toBe(
            "No activity in March",
        );
    });

    it("never says a card owes you", () => {
        for (const state of ["owed", "paid", "credit", "untouched"] as const) {
            expect(stateLabel(state, t, "October")).not.toMatch(/owes you/i);
        }
    });
});

describe("headlineState", () => {
    it("reads a quiet card, with no rows in the month, as untouched", () => {
        expect(headlineState(view({ name: "Gold" }))).toBe("untouched");
    });

    it.each([
        ["a charge paid off", { charged: 500, paid: 500 }],
        ["points that cleared it", { charged: 500, redeemed: 500 }],
    ])("still reads %s as paid in full", (_case, over) => {
        expect(headlineState(view({ name: "Gold", ...over }))).toBe("paid");
    });

    it.each([
        ["owed", { charged: 830, balance: 830 }],
        ["credit", { paid: 416, balance: -416 }],
    ] as const)("passes %s through", (state, over) => {
        expect(headlineState(view({ name: "Gold", state, ...over }))).toBe(
            state,
        );
    });
});

describe("isSettled", () => {
    it.each([
        ["paid", true],
        ["credit", false],
        ["owed", false],
        ["untouched", false],
    ] as const)("reads %s as settled: %s", (state, expected) => {
        expect(isSettled(state)).toBe(expected);
    });
});

describe("balanceFootnote", () => {
    it("says nothing is owed for the month when it was paid exactly", () => {
        expect(
            balanceFootnote(
                view({ name: "NU", charged: 500, paid: 500 }),
                "September",
                "paid",
                t,
            ),
        ).toBe("Nothing owed for September");
    });

    it("says how much more was paid than charged in the month", () => {
        expect(
            balanceFootnote(
                view({
                    name: "Gold",
                    paid: 416,
                    balance: -416,
                    state: "credit",
                }),
                "October",
                "credit",
                t,
            ),
        ).toBe("You paid $416.00 more than you charged in October.");
    });

    it.each(["owed", "untouched"] as const)("has no line for %s", (state) => {
        expect(
            balanceFootnote(view({ name: "Gold" }), "October", state, t),
        ).toBeNull();
    });
});

describe("cardTypeLabel", () => {
    it("names a seeded type in the active locale", () => {
        expect(cardTypeLabel("credit", t)).toBe("Credit");
        expect(cardTypeLabel("debit", tEs)).toBe("Débito");
    });

    it("capitalises a type it has no message for", () => {
        expect(cardTypeLabel("store", t)).toBe("Store");
    });
});

describe("Spanish labels", () => {
    it("names the month in Spanish", () => {
        expect(stateLabel("owed", tEs, "septiembre")).toBe(
            "Por pagar de septiembre",
        );
        expect(stateLabel("paid", tEs, "septiembre")).toBe(
            "Pagada por completo",
        );
        expect(
            balanceFootnote(
                view({ name: "Gold", balance: -416, state: "credit" }),
                "octubre",
                "credit",
                tEs,
            ),
        ).toBe("Pagaste $416.00 más de lo que cargaste en octubre.");
    });
});

describe("breakdownInState", () => {
    const cards = [
        view({ name: "BBVA", balance: 6130, state: "owed" }),
        view({ name: "NU", balance: 0, state: "paid" }),
        view({ name: "Plat", balance: -10, state: "credit" }),
        view({ name: "Gold", balance: 1215.6, state: "owed" }),
        view({ name: "Oro", balance: -5, state: "credit" }),
    ];

    it("lists only the cards that are owed, with their balances", () => {
        expect(breakdownInState(cards, "owed")).toBe(
            "BBVA $6,130.00 + Gold $1,215.60",
        );
    });

    it("lists overpaid cards with the overpaid amount as a positive figure", () => {
        expect(breakdownInState(cards, "credit")).toBe(
            "Plat $10.00 + Oro $5.00",
        );
    });
});

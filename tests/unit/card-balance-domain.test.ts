import { describe, it, expect } from "vitest";

import {
    balanceAfterPayment,
    balanceState,
    cardBalance,
    cardStatement,
    isQuietCard,
    payFullAmount,
    quietCardsLast,
    summarizeCardBalances,
    totalCredit,
    totalOwed,
    withRunningBalance,
    type CardHistoryEntry,
} from "@/lib/domain/card-balance";

describe("cardBalance", () => {
    it("subtracts payments and redemptions from charges", () => {
        expect(
            cardBalance({ charged: 18400, paid: 12000, redeemed: 270 }),
        ).toBe(6130);
    });

    it("sums in centavos so float drift never shows", () => {
        expect(cardBalance({ charged: 0.3, paid: 0.1, redeemed: 0.2 })).toBe(0);
        expect(
            cardBalance({ charged: 9850.4, paid: 9850.4, redeemed: 0 }),
        ).toBe(0);
    });

    it("goes negative when payments exceed charges", () => {
        expect(
            cardBalance({ charged: 22310.75, paid: 23000, redeemed: 1200 }),
        ).toBe(-1889.25);
    });
});

describe("balanceState", () => {
    it.each([
        [6130, "owed"],
        [0.01, "owed"],
        [0, "paid"],
        [0.004, "paid"],
        [-0.004, "paid"],
        [-0.01, "credit"],
        [-1889.25, "credit"],
    ] as const)("reads %s as %s", (balance, state) => {
        expect(balanceState(balance)).toBe(state);
    });
});

describe("totalOwed", () => {
    it("adds every positive balance", () => {
        expect(totalOwed([6130, 1215.6])).toBe(7345.6);
    });

    it("does not let a card that owes you reduce what you owe elsewhere", () => {
        expect(totalOwed([6130, 0, -1889.25, 1215.6])).toBe(7345.6);
    });

    it("is zero with no cards or only credit balances", () => {
        expect(totalOwed([])).toBe(0);
        expect(totalOwed([-50])).toBe(0);
    });
});

describe("totalCredit", () => {
    it("adds what overpaid cards owe you as a positive figure", () => {
        expect(totalCredit([6130, -1889.25, -10.75])).toBe(1900);
    });

    it("is zero when no card owes you", () => {
        expect(totalCredit([6130, 0])).toBe(0);
    });
});

const T = (charged: number, paid: number, redeemed = 0) => ({
    charged,
    paid,
    redeemed,
});

describe("cardStatement", () => {
    it("reads the month on its own: charged − paid − redeemed", () => {
        expect(cardStatement(T(1300, 416))).toEqual({
            charged: 1300,
            paid: 416,
            redeemed: 0,
            balance: 884,
            state: "owed",
        });
    });

    it("ends in credit when the month's payments pass its charges", () => {
        expect(cardStatement(T(0, 700, 20))).toMatchObject({
            balance: -720,
            state: "credit",
        });
    });

    it("keeps centavos exact", () => {
        expect(cardStatement(T(0.3, 0.1, 0.2))).toEqual({
            charged: 0.3,
            paid: 0.1,
            redeemed: 0.2,
            balance: 0,
            state: "paid",
        });
    });
});

describe("isQuietCard", () => {
    it("is quiet with no charge, payment or redemption", () => {
        expect(isQuietCard(T(0, 0))).toBe(true);
        expect(isQuietCard(T(0.004, 0))).toBe(true);
    });

    it.each([
        ["a charge", T(830, 0)],
        ["a payment", T(0, 416)],
        ["a redemption", T(0, 0, 20)],
        ["activity that nets to 0", T(500, 500)],
    ])("is not quiet with %s", (_, totals) => {
        expect(isQuietCard(totals)).toBe(false);
    });
});

describe("quietCardsLast", () => {
    it("puts quiet cards after the rest, keeping the A→Z order it was given", () => {
        const sorted = quietCardsLast([
            { name: "Amex", ...T(0, 0) },
            { name: "BBVA", ...T(830, 0) },
            { name: "Gold", ...T(0, 30) },
            { name: "NU", ...T(500, 500) },
            { name: "Plat", ...T(0, 0) },
        ]);

        expect(sorted.map((c) => c.name)).toEqual([
            "BBVA",
            "Gold",
            "NU",
            "Amex",
            "Plat",
        ]);
    });

    it("never re-sorts inside a group: the order received is kept", () => {
        const sorted = quietCardsLast([
            { name: "Zeta", ...T(1, 0) },
            { name: "zulu", ...T(0, 0) },
            { name: "Alpha", ...T(1, 0) },
            { name: "Able", ...T(0, 0) },
        ]);

        expect(sorted.map((c) => c.name)).toEqual([
            "Zeta",
            "Alpha",
            "zulu",
            "Able",
        ]);
    });

    it("leaves the input untouched", () => {
        const cards = [
            { name: "B", ...T(0, 0) },
            { name: "A", ...T(1, 0) },
        ];

        quietCardsLast(cards);

        expect(cards.map((c) => c.name)).toEqual(["B", "A"]);
    });
});

describe("summarizeCardBalances", () => {
    it("gives each card its month statement, quiet cards last, and totals the month", () => {
        const summary = summarizeCardBalances([
            { name: "Amex", ...T(0, 0) },
            { name: "BBVA", ...T(90, 0) },
            { name: "NU", ...T(5, 5) },
            { name: "Plat", ...T(0, 20) },
        ]);

        expect(summary.cards.map((c) => [c.name, c.balance, c.state])).toEqual([
            ["BBVA", 90, "owed"],
            ["NU", 0, "paid"],
            ["Plat", -20, "credit"],
            ["Amex", 0, "paid"],
        ]);
        expect(summary.totalOwed).toBe(90);
        expect(summary.totalCredit).toBe(20);
    });
});

describe("payFullAmount", () => {
    it("fills the balance when something is owed", () => {
        expect(payFullAmount(6130)).toBe(6130);
    });

    it.each([0, -20])("offers nothing for a balance of %s", (b) => {
        expect(payFullAmount(b)).toBeNull();
    });
});

describe("balanceAfterPayment", () => {
    it("subtracts the payment in centavos", () => {
        expect(balanceAfterPayment(6130, 3000)).toBe(3130);
        expect(balanceAfterPayment(0.3, 0.1)).toBe(0.2);
    });

    it("returns null while the amount is not a number", () => {
        expect(balanceAfterPayment(6130, Number.NaN)).toBeNull();
    });
});

describe("withRunningBalance", () => {
    const entry = (
        over: Partial<CardHistoryEntry> & Pick<CardHistoryEntry, "id">,
    ): CardHistoryEntry => ({
        kind: "charge",
        date: new Date("2026-09-10T06:00:00Z"),
        createdAt: new Date("2026-09-10T12:00:00Z"),
        description: "x",
        detail: null,
        isShared: false,
        amount: 100,
        ...over,
    });

    it("orders newest first and carries the balance after each line", () => {
        const lines = withRunningBalance([
            entry({
                id: "p",
                kind: "payment",
                amount: 3000,
                date: new Date("2026-09-28T06:00:00Z"),
            }),
            entry({
                id: "a",
                amount: 1150,
                date: new Date("2026-09-12T06:00:00Z"),
            }),
            entry({
                id: "b",
                amount: 2840.1,
                date: new Date("2026-09-26T06:00:00Z"),
            }),
        ]);

        expect(
            lines.map((l) => [l.id, l.signedAmount, l.balanceAfter]),
        ).toEqual([
            ["p", -3000, 990.1],
            ["b", 2840.1, 3990.1],
            ["a", 1150, 1150],
        ]);
    });

    it("breaks a same-day tie by entry time, then by id", () => {
        const day = new Date("2026-09-10T06:00:00Z");
        const lines = withRunningBalance([
            entry({
                id: "z",
                date: day,
                createdAt: new Date("2026-09-10T09:00:00Z"),
            }),
            entry({
                id: "y",
                kind: "payment",
                amount: 50,
                date: day,
                createdAt: new Date("2026-09-10T10:00:00Z"),
            }),
            entry({
                id: "b",
                date: day,
                createdAt: new Date("2026-09-10T08:00:00Z"),
            }),
            entry({
                id: "a",
                date: day,
                createdAt: new Date("2026-09-10T08:00:00Z"),
            }),
        ]);

        expect(lines.map((l) => [l.id, l.balanceAfter])).toEqual([
            ["y", 250],
            ["z", 300],
            ["b", 200],
            ["a", 100],
        ]);
    });

    it("starts the running balance at 0 and can run into credit", () => {
        const lines = withRunningBalance([
            entry({ id: "c", amount: 250.5 }),
            entry({
                id: "p",
                kind: "payment",
                amount: 600,
                date: new Date("2026-09-20T06:00:00Z"),
            }),
        ]);

        expect(lines.map((l) => [l.id, l.balanceAfter])).toEqual([
            ["p", -349.5],
            ["c", 250.5],
        ]);
    });

    it("returns nothing for no entries", () => {
        expect(withRunningBalance([])).toEqual([]);
    });
});

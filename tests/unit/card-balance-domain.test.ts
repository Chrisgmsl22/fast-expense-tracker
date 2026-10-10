import { describe, it, expect } from "vitest";

import {
    balanceAfterPayment,
    balanceState,
    cardBalance,
    cardStatement,
    payFullAmount,
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
    it("adds the month to the opening balance, like a bank statement", () => {
        expect(
            cardStatement({ before: T(1000, 400), during: T(250.5, 100) }),
        ).toEqual({
            opening: 600,
            charged: 250.5,
            paid: 100,
            redeemed: 0,
            balance: 750.5,
            state: "owed",
        });
    });

    it("ends in credit when the month's payments pass what was owed", () => {
        expect(
            cardStatement({ before: T(500, 0), during: T(0, 700, 20) }),
        ).toMatchObject({ opening: 500, balance: -220, state: "credit" });
    });

    it("opens in credit and keeps centavos exact", () => {
        expect(
            cardStatement({ before: T(0.1, 0.3), during: T(0.2, 0) }),
        ).toMatchObject({
            opening: -0.2,
            charged: 0.2,
            balance: 0,
            state: "paid",
        });
    });
});

describe("summarizeCardBalances", () => {
    it("gives each card its month statement and totals the month's end", () => {
        const summary = summarizeCardBalances([
            { name: "BBVA", before: T(100, 40), during: T(30, 0) },
            { name: "Plat", before: T(10, 30), during: T(0, 0) },
            { name: "NU", before: T(5, 0), during: T(0, 5) },
        ]);

        expect(
            summary.cards.map((c) => [c.name, c.opening, c.balance, c.state]),
        ).toEqual([
            ["BBVA", 60, 90, "owed"],
            ["Plat", -20, -20, "credit"],
            ["NU", 5, 0, "paid"],
        ]);
        expect(summary.cards[0]).not.toHaveProperty("before");
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

    it("continues the running balance from an opening balance", () => {
        const lines = withRunningBalance(
            [
                entry({ id: "c", amount: 250.5 }),
                entry({
                    id: "p",
                    kind: "payment",
                    amount: 100,
                    date: new Date("2026-09-20T06:00:00Z"),
                }),
            ],
            600,
        );

        expect(lines.map((l) => [l.id, l.balanceAfter])).toEqual([
            ["p", 750.5],
            ["c", 850.5],
        ]);
    });

    it("returns nothing for no entries", () => {
        expect(withRunningBalance([])).toEqual([]);
    });
});

import { describe, expect, it } from "vitest";

import { isExpenseFrozen, isMovementFrozen } from "@/lib/domain/frozen-row";

const CLOSED = new Date("2026-09-14T20:38:00Z");

const SHARED = {
    amount: 1000,
    actualExpenditure: 680,
    isPartnerPayment: false,
};
const SOLO = { amount: 1000, actualExpenditure: 1000, isPartnerPayment: false };
const PAYMENT = { amount: 530, actualExpenditure: 530, isPartnerPayment: true };

describe("isExpenseFrozen", () => {
    it.each([
        ["a shared row in a closed cycle", SHARED, CLOSED, true],
        ["a payment in a closed cycle", PAYMENT, CLOSED, true],
        [
            "a solo row in a closed cycle, which no cycle counted",
            SOLO,
            CLOSED,
            false,
        ],
        ["a shared row in the open cycle", SHARED, null, false],
        ["a payment in the open cycle", PAYMENT, null, false],
    ] as const)("is %s → %s", (_label, row, cycleClosedAt, frozen) => {
        expect(isExpenseFrozen({ ...row, cycleClosedAt })).toBe(frozen);
    });
});

describe("isMovementFrozen", () => {
    it.each([
        ["gf_paid", CLOSED, true],
        ["gf_received", CLOSED, true],
        ["gf_fronted", CLOSED, true],
        ["partner_debt", CLOSED, true],
        ["card_payment", CLOSED, false],
        ["gf_paid", null, false],
        ["gf_fronted", null, false],
    ] as const)(
        "%s with cycle closed at %s → %s",
        (type, cycleClosedAt, frozen) => {
            expect(
                isMovementFrozen({ type, closedAt: null, cycleClosedAt }),
            ).toBe(frozen);
        },
    );
});

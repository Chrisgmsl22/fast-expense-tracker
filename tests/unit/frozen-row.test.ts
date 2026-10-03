import { describe, expect, it } from "vitest";

import {
    frozenExpenseRefusal,
    frozenMovementRefusal,
    isExpenseFrozen,
    isMovementFrozen,
    SPLIT_INTO_CLOSED_CYCLE_FIELD_ERROR,
    SPLIT_INTO_CLOSED_CYCLE_MESSAGE,
} from "@/lib/domain/frozen-row";

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

describe("frozenExpenseRefusal", () => {
    it.each([
        [
            SHARED,
            "edit",
            "Your partner's share of this expense counts in a settlement you already closed, so it can't be edited.",
        ],
        [
            SHARED,
            "delete",
            "Your partner's share of this expense counts in a settlement you already closed, so it can't be deleted.",
        ],
        [
            PAYMENT,
            "edit",
            "This payment counts in a settlement you already closed, so it can't be edited.",
        ],
        [
            PAYMENT,
            "delete",
            "This payment counts in a settlement you already closed, so it can't be deleted.",
        ],
    ] as const)("words the %s %s refusal exactly", (row, action, message) => {
        expect(
            frozenExpenseRefusal({ ...row, cycleClosedAt: CLOSED }, action),
        ).toBe(message);
    });

    it.each(["edit", "delete"] as const)(
        "returns null for a %s nothing freezes",
        (action) => {
            expect(
                frozenExpenseRefusal(
                    { ...SOLO, cycleClosedAt: CLOSED },
                    action,
                ),
            ).toBeNull();
            expect(
                frozenExpenseRefusal(
                    { ...SHARED, cycleClosedAt: null },
                    action,
                ),
            ).toBeNull();
        },
    );
});

describe("frozenMovementRefusal", () => {
    it.each([
        [
            "the marker transfer",
            { type: "gf_paid", closedAt: CLOSED },
            "edit",
            "This transfer closed a settlement and can't be edited.",
        ],
        [
            "the marker transfer",
            { type: "gf_received", closedAt: CLOSED },
            "delete",
            "This transfer closed a settlement and can't be deleted.",
        ],
        [
            "a transfer inside the cycle",
            { type: "gf_received", closedAt: null },
            "edit",
            "This transfer counts in a settlement you already closed, so it can't be edited.",
        ],
        [
            "a debt inside the cycle",
            { type: "gf_fronted", closedAt: null },
            "edit",
            "This debt counts in a settlement you already closed, so it can't be edited.",
        ],
        [
            "a debt she owes inside the cycle",
            { type: "partner_debt", closedAt: null },
            "edit",
            "This debt counts in a settlement you already closed, so it can't be edited.",
        ],
        [
            "any counted row",
            { type: "gf_fronted", closedAt: null },
            "delete",
            "This row counts in a settlement you already closed, so it can't be deleted.",
        ],
    ] as const)(
        "words %s's %s refusal exactly",
        (_label, row, action, message) => {
            expect(
                frozenMovementRefusal(
                    { ...row, cycleClosedAt: CLOSED },
                    action,
                ),
            ).toBe(message);
        },
    );

    it.each(["edit", "delete"] as const)(
        "returns null for a %s nothing freezes",
        (action) => {
            expect(
                frozenMovementRefusal(
                    {
                        type: "card_payment",
                        closedAt: null,
                        cycleClosedAt: CLOSED,
                    },
                    action,
                ),
            ).toBeNull();
            expect(
                frozenMovementRefusal(
                    { type: "gf_paid", closedAt: null, cycleClosedAt: null },
                    action,
                ),
            ).toBeNull();
        },
    );
});

describe("the split-into-a-closed-cycle refusal", () => {
    it("keeps its wording", () => {
        expect(SPLIT_INTO_CLOSED_CYCLE_MESSAGE).toBe(
            "This expense sits inside a settlement you already closed, so it can't be split with your partner now — that would change what the settlement settled.",
        );
        expect(SPLIT_INTO_CLOSED_CYCLE_FIELD_ERROR).toBe(
            "The settlement covering this date is already closed",
        );
    });
});

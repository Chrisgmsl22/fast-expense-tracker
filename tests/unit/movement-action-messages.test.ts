import { describe, expect, it } from "vitest";
import type { ZodError } from "zod";

import {
    frozenMovementMessage,
    translatedFieldErrors,
} from "@/app/_actions/movement/messages";
import {
    cardPaymentInputSchema,
    partnerDebtInputSchema,
    transferInputSchema,
    type CardPaymentInput,
    type PartnerDebtInput,
    type TransferInput,
} from "@/lib/schemas/movement";
import { setServerLocale } from "@/tests/support/intl";

function errorsOf<T>(
    result: { success: true } | { success: false; error: ZodError },
) {
    if (result.success) throw new Error("expected a failure");
    return translatedFieldErrors<T>(result.error);
}

const debtFailure = () =>
    partnerDebtInputSchema.safeParse({
        date: "2999-01-01",
        amount: "0",
        note: "x".repeat(201),
    });

describe("translatedFieldErrors", () => {
    it("keeps today's English wording for each known failure", async () => {
        expect(await errorsOf<PartnerDebtInput>(debtFailure())).toEqual({
            date: ["Date can't be later than today"],
            amount: ["Amount must be greater than 0"],
            note: ["Note must be 200 characters or fewer"],
        });
    });

    it("writes the same failures in Spanish", async () => {
        setServerLocale("es");
        expect(await errorsOf<PartnerDebtInput>(debtFailure())).toEqual({
            date: ["La fecha no puede ser posterior a hoy"],
            amount: ["El monto debe ser mayor que 0"],
            note: ["La nota debe tener 200 caracteres o menos"],
        });
    });

    it("asks for a card when none is picked", async () => {
        const result = cardPaymentInputSchema.safeParse({
            date: "2026-01-01",
            amount: "5",
            cardId: "",
        });
        expect(await errorsOf<CardPaymentInput>(result)).toEqual({
            cardId: ["Card is required"],
        });
    });

    it("refuses savings funding on money she sent", async () => {
        const result = transferInputSchema.safeParse({
            date: "2026-01-01",
            amount: "5",
            direction: "gf_received",
            fundedFrom: "savings",
        });
        expect(await errorsOf<TransferInput>(result)).toEqual({
            fundedFrom: ["Only money you send can be funded from savings"],
        });
    });

    it("falls back to a generic message for a failure it has no wording for", async () => {
        setServerLocale("es");
        const result = transferInputSchema.safeParse({
            date: "2026-01-01",
            amount: "5",
            direction: "sideways",
        });
        expect(await errorsOf<TransferInput>(result)).toEqual({
            direction: ["Valor no válido"],
        });
    });
});

describe("frozenMovementMessage", () => {
    const CLOSED = new Date("2026-07-12T00:00:00Z");
    const transfer = {
        type: "gf_received",
        closedAt: null,
        cycleClosedAt: CLOSED,
    };

    it("is null for a row no closed cycle counted", async () => {
        expect(
            await frozenMovementMessage(
                { ...transfer, cycleClosedAt: null },
                "edit",
            ),
        ).toBeNull();
        expect(
            await frozenMovementMessage(
                { type: "card_payment", closedAt: null, cycleClosedAt: CLOSED },
                "delete",
            ),
        ).toBeNull();
    });

    it("names the transfer that closed a settlement", async () => {
        const marker = { ...transfer, closedAt: CLOSED };
        expect(await frozenMovementMessage(marker, "edit")).toBe(
            "This transfer closed a settlement and can't be edited.",
        );
        expect(await frozenMovementMessage(marker, "delete")).toBe(
            "This transfer closed a settlement and can't be deleted.",
        );
    });

    it("words a counted row by what it is and what was tried", async () => {
        expect(await frozenMovementMessage(transfer, "delete")).toBe(
            "This row counts in a settlement you already closed, so it can't be deleted.",
        );
        expect(await frozenMovementMessage(transfer, "edit")).toBe(
            "This transfer counts in a settlement you already closed, so it can't be edited.",
        );
        expect(
            await frozenMovementMessage(
                { ...transfer, type: "gf_fronted" },
                "edit",
            ),
        ).toBe(
            "This debt counts in a settlement you already closed, so it can't be edited.",
        );
    });

    it("refuses in Spanish", async () => {
        setServerLocale("es");
        expect(
            await frozenMovementMessage(
                { ...transfer, type: "partner_debt" },
                "edit",
            ),
        ).toBe(
            "Esta deuda forma parte de una cuenta que ya cerraste, así que no se puede editar.",
        );
    });
});

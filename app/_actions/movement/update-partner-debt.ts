"use server";

import { z } from "zod";

import { getTranslations } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { isPartnerDebt } from "@/lib/domain/movement";
import { movementRepository } from "@/lib/repositories";
import type { MovementRepository } from "@/lib/repositories/movement.repository";
import {
    partnerDebtInputSchema,
    type PartnerDebtInput,
} from "@/lib/schemas/movement";
import { frozenMovementMessage, translatedFieldErrors } from "./messages";

/** The edit payload carries the row id alongside the debt fields. */
const idSchema = z.object({ id: z.string().min(1) });

/** Failure modes the caller can branch on. `not_found` also covers "not yours". */
export type UpdatePartnerDebtCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    /** A closed settlement cycle counted this debt, so it is frozen (spec 0007 §3.5). */
    | "cycle_closed"
    | "db_error";

export type UpdatePartnerDebtResult = ActionResult<
    { id: string },
    PartnerDebtInput,
    UpdatePartnerDebtCode
>;

/**
 * Edit an existing debt in either direction (spec 0007). Mirrors `addPartnerDebt`
 * but the write is **scoped by `userId`** (IDOR guard — a mismatch matches zero
 * rows → `not_found`). Only debt movements are editable here: refusing
 * any other type stops a card payment or transfer being retyped into a debt via
 * this action (the action is the enforcement seam, not just the UI).
 *
 * A debt a **closed settlement cycle counted** is refused (spec 0007 §3.5).
 */
export async function updatePartnerDebt(
    input: unknown,
    repo: MovementRepository = movementRepository,
): Promise<UpdatePartnerDebtResult> {
    const t = await getTranslations("movements");
    const parsed = partnerDebtInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.invalidDebt"),
            fieldErrors: await translatedFieldErrors<PartnerDebtInput>(
                parsed.error,
            ),
        };
    }
    const idParsed = idSchema.safeParse(input);
    if (!idParsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.invalidDebt"),
        };
    }
    const { id } = idParsed.data;

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: t("errors.unauthenticated"),
        };
    }

    const v = parsed.data;
    try {
        const existing = await repo.getById(userId, id);
        if (!existing || !isPartnerDebt(existing.type)) {
            return {
                ok: false,
                code: "not_found",
                message: t("errors.debtNotFound"),
            };
        }

        if (v.direction !== undefined && v.direction !== existing.type) {
            return {
                ok: false,
                code: "validation",
                message: t("errors.debtDirectionLocked"),
                fieldErrors: {
                    direction: [t("fieldErrors.directionMismatch")],
                },
            };
        }

        // A debt carries no marker column — the DB CHECK allows `closedAt` only on a
        // transfer — so the repository where-clause never blocked it.
        const refusal = await frozenMovementMessage(existing, "edit");
        if (refusal) {
            return { ok: false, code: "cycle_closed", message: refusal };
        }

        const count = await repo.updateForUser(id, userId, {
            date: cdmxCalendarDateToUtc(v.date),
            amount: v.amount,
            type: existing.type,
            cardId: null,
            note: v.note?.trim() || null,
        });
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: t("errors.debtNotFound"),
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updatePartnerDebt: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("errors.debtDbError"),
        };
    }
}

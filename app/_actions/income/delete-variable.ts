"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { getSessionUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/result";
import { incomeRepository } from "@/lib/repositories";
import type { IncomeRepository } from "@/lib/repositories/income.repository";

const idSchema = z.object({ id: z.string().min(1) });

/** `not_found` also covers "not yours" — the row matched no owned income. */
export type DeleteVariableIncomeCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

export type DeleteVariableIncomeResult = ActionResult<
    { id: string },
    { id: string },
    DeleteVariableIncomeCode
>;

/**
 * Delete a VARIABLE income row for the signed-in user (slice 2.3). Scoped by
 * `userId` (IDOR guard): a row that isn't the user's matches nothing and
 * returns `not_found` rather than deleting another user's data. The repository
 * further scopes to VARIABLE so the FIXED row is never removed here.
 */
export async function deleteVariableIncome(
    input: unknown,
    repo: IncomeRepository = incomeRepository,
): Promise<DeleteVariableIncomeResult> {
    const t = await getTranslations("income");
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.missingId"),
        };
    }
    const { id } = parsed.data;

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: t("errors.unauthenticated"),
        };
    }

    try {
        const count = await repo.deleteVariableForUser(id, userId);
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: t("errors.notFound"),
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("deleteVariableIncome: db delete failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("errors.deleteFailed"),
        };
    }
}

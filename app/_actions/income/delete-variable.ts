"use server";

import { z } from "zod";

import { auth } from "@/auth";
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
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, code: "validation", message: "Missing income id" };
    }
    const { id } = parsed.data;

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: "Not authenticated",
        };
    }

    try {
        const count = await repo.deleteVariableForUser(id, userId);
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "Income not found.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("deleteVariableIncome: db delete failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not delete the income. Please try again.",
        };
    }
}

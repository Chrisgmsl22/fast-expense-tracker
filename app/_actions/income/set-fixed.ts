"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { incomeRepository } from "@/lib/repositories";
import type { IncomeRepository } from "@/lib/repositories/income.repository";
import {
    fixedIncomeInputSchema,
    type FixedIncomeInput,
} from "@/lib/schemas/income";

/** Failure modes the caller can branch on. */
export type SetFixedIncomeCode = "validation" | "unauthenticated" | "db_error";

export type SetFixedIncomeResult = ActionResult<
    { amount: number },
    FixedIncomeInput,
    SetFixedIncomeCode
>;

/**
 * Set the signed-in user's recurring monthly (FIXED) income (slice 2.3).
 * Upserts the single FIXED row via the repository. Allows 0 to clear it.
 */
export async function setFixedIncome(
    input: unknown,
    repo: IncomeRepository = incomeRepository,
): Promise<SetFixedIncomeResult> {
    const parsed = fixedIncomeInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid amount",
            fieldErrors: toFieldErrors<FixedIncomeInput>(parsed.error),
        };
    }

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
        await repo.setFixed(userId, parsed.data.amount);
        return { ok: true, data: { amount: parsed.data.amount } };
    } catch (e) {
        console.error("setFixedIncome: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not update fixed income. Please try again.",
        };
    }
}

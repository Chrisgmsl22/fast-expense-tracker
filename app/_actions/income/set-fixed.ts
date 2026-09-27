"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { getCurrentMonthCdmx } from "@/lib/dates";
import { incomeRepository } from "@/lib/repositories";
import type { IncomeRepository } from "@/lib/repositories/income.repository";
import {
    fixedIncomeInputSchema,
    type FixedIncomeInput,
} from "@/lib/schemas/income";

/** Failure modes the caller can branch on. */
export type SetFixedIncomeCode = "validation" | "unauthenticated" | "db_error";

export type SetFixedIncomeResult = ActionResult<
    { amount: number; effectiveMonth: string },
    FixedIncomeInput,
    SetFixedIncomeCode
>;

// With no month, or the current CDMX month (server clock), the amount applies
// from now on. A past month changes that month alone. A future month is refused,
// so a client month can never move the forward start date.
export async function setFixedIncome(
    input: unknown,
    repo: IncomeRepository = incomeRepository,
): Promise<SetFixedIncomeResult> {
    const parsed = fixedIncomeInputSchema.safeParse(input);
    if (!parsed.success) {
        const fieldErrors = toFieldErrors<FixedIncomeInput>(parsed.error);
        return {
            ok: false,
            code: "validation",
            message: fieldErrors.month ? "Invalid month" : "Invalid amount",
            fieldErrors,
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

    const currentMonth = getCurrentMonthCdmx();
    const month = parsed.data.month ?? currentMonth;
    if (month > currentMonth) {
        return {
            ok: false,
            code: "validation",
            message: "Fixed income can't be set for a future month",
            fieldErrors: { month: ["Month can't be after the current month"] },
        };
    }

    const { amount } = parsed.data;
    try {
        if (month < currentMonth) {
            await repo.setFixedForMonthOnly(userId, month, amount);
        } else {
            await repo.setFixed(userId, currentMonth, amount);
        }
        return { ok: true, data: { amount, effectiveMonth: month } };
    } catch (e) {
        console.error("setFixedIncome: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not update fixed income. Please try again.",
        };
    }
}

"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { incomeRepository } from "@/lib/repositories";
import type { IncomeRepository } from "@/lib/repositories/income.repository";
import {
    variableIncomeInputSchema,
    type VariableIncomeInput,
} from "@/lib/schemas/income";

/** Failure modes the caller can branch on. */
export type AddVariableIncomeCode =
    | "validation"
    | "unauthenticated"
    | "db_error";

export type AddVariableIncomeResult = ActionResult<
    { id: string },
    VariableIncomeInput,
    AddVariableIncomeCode
>;

/**
 * Log a one-off (VARIABLE) income for the signed-in user (slice 2.3).
 *
 * Orchestration only: validate → authenticate → CDMX→UTC date → persist → map
 * failures. The date is stored in the same CDMX-06:00Z frame as expenses so
 * month-range queries land in the month the user picked.
 */
export async function addVariableIncome(
    input: unknown,
    repo: IncomeRepository = incomeRepository,
): Promise<AddVariableIncomeResult> {
    const parsed = variableIncomeInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid income",
            fieldErrors: toFieldErrors<VariableIncomeInput>(parsed.error),
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

    const v = parsed.data;
    try {
        const created = await repo.insertVariable(userId, {
            date: cdmxCalendarDateToUtc(v.date),
            source: v.source,
            amount: v.amount,
        });
        return { ok: true, data: { id: created.id } };
    } catch (e) {
        console.error("addVariableIncome: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the income. Please try again.",
        };
    }
}

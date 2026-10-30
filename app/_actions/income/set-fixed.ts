"use server";

import { getTranslations } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import { localizeFieldErrors, toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { getCurrentMonthCdmx } from "@/lib/dates";
import { incomeRepository } from "@/lib/repositories";
import type { IncomeRepository } from "@/lib/repositories/income.repository";
import {
    fixedIncomeInputSchema,
    type FixedIncomeInput,
} from "@/lib/schemas/income";

import { incomeSchemaMessages } from "./field-messages";

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
    const t = await getTranslations("income");
    const parsed = fixedIncomeInputSchema.safeParse(input);
    if (!parsed.success) {
        const fieldErrors = localizeFieldErrors(
            toFieldErrors<FixedIncomeInput>(parsed.error),
            incomeSchemaMessages(t),
        );
        return {
            ok: false,
            code: "validation",
            message: fieldErrors.month
                ? t("errors.invalidMonth")
                : t("errors.invalidAmount"),
            fieldErrors,
        };
    }

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: t("errors.unauthenticated"),
        };
    }

    const currentMonth = getCurrentMonthCdmx();
    const month = parsed.data.month ?? currentMonth;
    if (month > currentMonth) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.futureMonth"),
            fieldErrors: { month: [t("fields.monthAfterCurrent")] },
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
            message: t("errors.fixedFailed"),
        };
    }
}

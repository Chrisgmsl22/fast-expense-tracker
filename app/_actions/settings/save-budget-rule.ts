"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { getCurrentMonthCdmx } from "@/lib/dates";
import type { BudgetRule } from "@/lib/domain/budget-rule";
import { budgetRuleRepository } from "@/lib/repositories";
import type { BudgetRuleRepository } from "@/lib/repositories/budget-rule.repository";
import {
    budgetRuleInputSchema,
    type BudgetRuleInput,
} from "@/lib/schemas/budget-rule";

export type SaveBudgetRuleCode = "validation" | "unauthenticated" | "db_error";

export type SaveBudgetRuleResult = ActionResult<
    { effectiveMonth: string; rule: BudgetRule },
    BudgetRuleInput,
    SaveBudgetRuleCode
>;

// Saves the split for the current CDMX month. The month comes from the server
// clock, not a parameter: a client can send a Date to a server action, and
// could then rewrite a past month's split.
export async function saveBudgetRule(
    input: unknown,
    repo: BudgetRuleRepository = budgetRuleRepository,
): Promise<SaveBudgetRuleResult> {
    const parsed = budgetRuleInputSchema.safeParse(input);
    if (!parsed.success) {
        const sumIssue = parsed.error.issues.find((i) => i.path.length === 0);
        return {
            ok: false,
            code: "validation",
            message: sumIssue?.message ?? "Please fix the highlighted fields.",
            fieldErrors: toFieldErrors<BudgetRuleInput>(parsed.error),
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

    const effectiveMonth = getCurrentMonthCdmx();
    const rule: BudgetRule = {
        essentials: parsed.data.essentials,
        discretionary: parsed.data.discretionary,
        savings: parsed.data.savings,
    };
    try {
        await repo.saveRule(userId, effectiveMonth, rule);
        return { ok: true, data: { effectiveMonth, rule } };
    } catch (e) {
        console.error("saveBudgetRule: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save your budget rule. Please try again.",
        };
    }
}

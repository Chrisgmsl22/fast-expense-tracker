"use server";

import { getTranslations } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import {
    localizeFieldErrors,
    localizeMessage,
    toFieldErrors,
} from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { getCurrentMonthCdmx } from "@/lib/dates";
import type { BudgetRule } from "@/lib/domain/budget-rule";
import { budgetRuleRepository } from "@/lib/repositories";
import type { BudgetRuleRepository } from "@/lib/repositories/budget-rule.repository";
import {
    budgetRuleInputSchema,
    type BudgetRuleInput,
} from "@/lib/schemas/budget-rule";
import { budgetRuleMessages } from "./schema-messages";

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
    const t = await getTranslations("settings");
    const parsed = budgetRuleInputSchema.safeParse(input);
    if (!parsed.success) {
        const translations = await budgetRuleMessages();
        const sumIssue = parsed.error.issues.find((i) => i.path.length === 0);
        return {
            ok: false,
            code: "validation",
            message: sumIssue
                ? localizeMessage(sumIssue.message, translations)
                : t("errors.fixFields"),
            fieldErrors: localizeFieldErrors(
                toFieldErrors<BudgetRuleInput>(parsed.error),
                translations,
            ),
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
            message: t("budget.errors.dbError"),
        };
    }
}

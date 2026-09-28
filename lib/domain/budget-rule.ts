import type { BucketKey } from "@/lib/domain/dashboard";
import { resolveEffective } from "@/lib/domain/effective-month";

/** Whole-number percent of income per bucket; the three sum to 100. */
export type BudgetRule = Record<BucketKey, number>;

/** A rule and the first month it applies to (`YYYY-MM`). */
export type EffectiveBudgetRule = BudgetRule & { effectiveMonth: string };

export const DEFAULT_BUDGET_RULE: BudgetRule = {
    essentials: 50,
    discretionary: 25,
    savings: 25,
};

// The latest rule at or before `month`, else the default.
export function resolveBudgetRule(
    rules: readonly EffectiveBudgetRule[],
    month: string,
): BudgetRule {
    const match = resolveEffective(rules, month);
    if (!match) return DEFAULT_BUDGET_RULE;
    return {
        essentials: match.essentials,
        discretionary: match.discretionary,
        savings: match.savings,
    };
}

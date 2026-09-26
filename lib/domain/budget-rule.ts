import type { BucketKey } from "@/lib/domain/dashboard";

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
// `YYYY-MM` strings sort in month order, so a string compare is safe.
export function resolveBudgetRule(
    rules: readonly EffectiveBudgetRule[],
    month: string,
): BudgetRule {
    let match: EffectiveBudgetRule | undefined;
    for (const rule of rules) {
        if (rule.effectiveMonth > month) continue;
        if (!match || rule.effectiveMonth > match.effectiveMonth) match = rule;
    }
    if (!match) return DEFAULT_BUDGET_RULE;
    return {
        essentials: match.essentials,
        discretionary: match.discretionary,
        savings: match.savings,
    };
}

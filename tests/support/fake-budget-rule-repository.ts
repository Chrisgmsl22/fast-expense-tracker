import type { BudgetRule, EffectiveBudgetRule } from "@/lib/domain/budget-rule";
import type { BudgetRuleRepository } from "@/lib/repositories/budget-rule.repository";

/** In-memory `BudgetRuleRepository` with the Prisma adapter's contract. */
export class FakeBudgetRuleRepository implements BudgetRuleRepository {
    private readonly rows = new Map<string, EffectiveBudgetRule[]>();

    failOnWrite = false;

    readonly saves: Array<{
        userId: string;
        effectiveMonth: string;
        rule: BudgetRule;
    }> = [];

    seed(userId: string, effectiveMonth: string, rule: BudgetRule): void {
        const rest = (this.rows.get(userId) ?? []).filter(
            (r) => r.effectiveMonth !== effectiveMonth,
        );
        this.rows.set(
            userId,
            [...rest, { effectiveMonth, ...rule }].sort((a, b) =>
                a.effectiveMonth.localeCompare(b.effectiveMonth),
            ),
        );
    }

    async listRules(userId: string): Promise<EffectiveBudgetRule[]> {
        return (this.rows.get(userId) ?? []).map((r) => ({ ...r }));
    }

    async saveRule(
        userId: string,
        effectiveMonth: string,
        rule: BudgetRule,
    ): Promise<void> {
        if (this.failOnWrite) throw new Error("fake: saveRule failed");
        this.seed(userId, effectiveMonth, rule);
        this.saves.push({ userId, effectiveMonth, rule });
    }
}

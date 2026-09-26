import type { PrismaClient } from "@prisma/client";

import type { BudgetRule, EffectiveBudgetRule } from "@/lib/domain/budget-rule";

// Every read and write is scoped by `userId`. Which rule applies to a month is
// `resolveBudgetRule`'s job, not this adapter's.
export interface BudgetRuleRepository {
    listRules(userId: string): Promise<EffectiveBudgetRule[]>;
    saveRule(
        userId: string,
        effectiveMonth: string,
        rule: BudgetRule,
    ): Promise<void>;
}

export class PrismaBudgetRuleRepository implements BudgetRuleRepository {
    constructor(private readonly db: PrismaClient) {}

    async listRules(userId: string): Promise<EffectiveBudgetRule[]> {
        return this.db.budgetRule.findMany({
            where: { userId },
            orderBy: { effectiveMonth: "asc" },
            select: {
                effectiveMonth: true,
                essentials: true,
                discretionary: true,
                savings: true,
            },
        });
    }

    async saveRule(
        userId: string,
        effectiveMonth: string,
        rule: BudgetRule,
    ): Promise<void> {
        const split = {
            essentials: rule.essentials,
            discretionary: rule.discretionary,
            savings: rule.savings,
        };
        await this.db.budgetRule.upsert({
            where: { userId_effectiveMonth: { userId, effectiveMonth } },
            create: { userId, effectiveMonth, ...split },
            update: split,
        });
    }
}

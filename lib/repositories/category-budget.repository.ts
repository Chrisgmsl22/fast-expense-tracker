import type { PrismaClient } from "@prisma/client";

/**
 * Data-access for per-month category budgets — the "port" (ADR-0016). Owns the
 * `CategoryBudget` override rows AND the default on `Category.monthlyBudget`, so
 * the write action has one collaborator for "set this month" + "set default".
 * Budgets are global (no `userId`), mirroring the global `Category` table.
 */
export interface CategoryBudgetRepository {
    /** The override amount for one category+month, or null if none is set. */
    getOverride(categoryId: string, month: string): Promise<number | null>;
    /**
     * Override amounts for several categories in a month, keyed by categoryId.
     * A category with no override is absent from the map (caller falls back to
     * the default). For the dashboard grid.
     */
    getOverridesForMonth(
        categoryIds: string[],
        month: string,
    ): Promise<Map<string, number>>;
    /**
     * Set the category's default and this month's override in ONE transaction,
     * so the two never persist half-applied. `defaultAmount` null clears the
     * default; `thisMonthAmount` null clears the month override (falls back to
     * the default). Either both writes land or neither does.
     */
    setBudget(
        categoryId: string,
        month: string,
        defaultAmount: number | null,
        thisMonthAmount: number | null,
    ): Promise<void>;
}

export class PrismaCategoryBudgetRepository implements CategoryBudgetRepository {
    constructor(private readonly db: PrismaClient) {}

    async getOverride(
        categoryId: string,
        month: string,
    ): Promise<number | null> {
        const row = await this.db.categoryBudget.findUnique({
            where: { categoryId_month: { categoryId, month } },
            select: { amount: true },
        });
        return row?.amount ?? null;
    }

    async getOverridesForMonth(
        categoryIds: string[],
        month: string,
    ): Promise<Map<string, number>> {
        if (categoryIds.length === 0) return new Map();
        const rows = await this.db.categoryBudget.findMany({
            where: { month, categoryId: { in: categoryIds } },
            select: { categoryId: true, amount: true },
        });
        return new Map(rows.map((r) => [r.categoryId, r.amount]));
    }

    async setBudget(
        categoryId: string,
        month: string,
        defaultAmount: number | null,
        thisMonthAmount: number | null,
    ): Promise<void> {
        // Batch (array-form) $transaction: both writes commit together or roll
        // back together, so a partial failure never leaves the default updated
        // while the override write was lost (or vice versa).
        await this.db.$transaction([
            this.db.category.update({
                where: { id: categoryId },
                data: { monthlyBudget: defaultAmount },
            }),
            thisMonthAmount === null
                ? this.db.categoryBudget.deleteMany({
                      where: { categoryId, month },
                  })
                : this.db.categoryBudget.upsert({
                      where: { categoryId_month: { categoryId, month } },
                      create: { categoryId, month, amount: thisMonthAmount },
                      update: { amount: thisMonthAmount },
                  }),
        ]);
    }
}

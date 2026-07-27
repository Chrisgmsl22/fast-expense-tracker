import type { PrismaClient } from "@prisma/client";

/**
 * Data-access for per-month category budgets — the "port" (ADR-0016, ADR-0022).
 * Owns the `CategoryBudget` override rows AND the default on
 * `Category.monthlyBudget`, so the write action has one collaborator for "set
 * this month" + "set default". Budgets are per-user (ADR-0022): every read is
 * scoped by `userId` and every write stamps + verifies it, so a user can never
 * read or overwrite another user's budget.
 */
export interface CategoryBudgetRepository {
    /** The override amount for one user's category+month, or null if unset. */
    getOverride(
        userId: string,
        categoryId: string,
        month: string,
    ): Promise<number | null>;
    /**
     * Override amounts for several of the user's categories in a month, keyed by
     * categoryId. A category with no override is absent from the map (caller
     * falls back to the default). For the dashboard grid.
     */
    getOverridesForMonth(
        userId: string,
        categoryIds: string[],
        month: string,
    ): Promise<Map<string, number>>;
    /**
     * Set the category's default and this month's override in ONE transaction,
     * so the two never persist half-applied. `defaultAmount` null clears the
     * default; `thisMonthAmount` null clears the month override (falls back to
     * the default). Either both writes land or neither does. Scoped to `userId`
     * so a user can only ever mutate their own category + override rows.
     */
    setBudget(
        userId: string,
        categoryId: string,
        month: string,
        defaultAmount: number | null,
        thisMonthAmount: number | null,
    ): Promise<void>;
}

export class PrismaCategoryBudgetRepository implements CategoryBudgetRepository {
    constructor(private readonly db: PrismaClient) {}

    async getOverride(
        userId: string,
        categoryId: string,
        month: string,
    ): Promise<number | null> {
        const row = await this.db.categoryBudget.findUnique({
            where: { userId_categoryId_month: { userId, categoryId, month } },
            select: { amount: true },
        });
        return row?.amount ?? null;
    }

    async getOverridesForMonth(
        userId: string,
        categoryIds: string[],
        month: string,
    ): Promise<Map<string, number>> {
        if (categoryIds.length === 0) return new Map();
        const rows = await this.db.categoryBudget.findMany({
            where: { userId, month, categoryId: { in: categoryIds } },
            select: { categoryId: true, amount: true },
        });
        return new Map(rows.map((r) => [r.categoryId, r.amount]));
    }

    async setBudget(
        userId: string,
        categoryId: string,
        month: string,
        defaultAmount: number | null,
        thisMonthAmount: number | null,
    ): Promise<void> {
        // Batch (array-form) $transaction: both writes commit together or roll
        // back together, so a partial failure never leaves the default updated
        // while the override write was lost (or vice versa). The default write
        // is an `updateMany` scoped by userId, so it only ever touches the
        // caller's own category (IDOR-safe — a foreign categoryId matches zero
        // rows rather than mutating someone else's default).
        await this.db.$transaction([
            this.db.category.updateMany({
                where: { id: categoryId, userId },
                data: { monthlyBudget: defaultAmount },
            }),
            thisMonthAmount === null
                ? this.db.categoryBudget.deleteMany({
                      where: { userId, categoryId, month },
                  })
                : this.db.categoryBudget.upsert({
                      where: {
                          userId_categoryId_month: {
                              userId,
                              categoryId,
                              month,
                          },
                      },
                      create: {
                          userId,
                          categoryId,
                          month,
                          amount: thisMonthAmount,
                      },
                      update: { amount: thisMonthAmount },
                  }),
        ]);
    }
}

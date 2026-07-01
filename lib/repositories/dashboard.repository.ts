import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import type { CategorySpend } from "@/lib/domain/dashboard";

/**
 * Read-only aggregates for the dashboard — the "port". Returns raw summed
 * spend per category; the 50/25/25 math lives in `lib/domain/dashboard.ts`, the
 * assembly in `getDashboardSummary`. Mirrors the expense/income repositories so
 * an in-memory fake is swappable in tests.
 */
export interface DashboardRepository {
    /**
     * My-share spend (`actualExpenditure`) summed per category for the month,
     * with the slug + `isRelevant` each category needs to be bucketed.
     * Categories with no spend that month are omitted.
     */
    getCategorySpends(userId: string, month: string): Promise<CategorySpend[]>;
}

export class PrismaDashboardRepository implements DashboardRepository {
    constructor(private readonly db: PrismaClient) {}

    async getCategorySpends(
        userId: string,
        month: string,
    ): Promise<CategorySpend[]> {
        const { start, end } = getMonthRangeUtc(month);
        const grouped = await this.db.expense.groupBy({
            by: ["categoryId"],
            where: { userId, date: { gte: start, lt: end } },
            _sum: { actualExpenditure: true },
        });
        if (grouped.length === 0) return [];

        // One lookup for the slug/isRelevant of just the categories with spend.
        const categories = await this.db.category.findMany({
            where: { id: { in: grouped.map((g) => g.categoryId) } },
            select: { id: true, slug: true, isRelevant: true },
        });
        const meta = new Map(categories.map((c) => [c.id, c]));

        return grouped.flatMap((g) => {
            const c = meta.get(g.categoryId);
            // A grouped categoryId always resolves (FK), but guard the lookup.
            if (!c) return [];
            return [
                {
                    slug: c.slug,
                    isRelevant: c.isRelevant,
                    spent: g._sum.actualExpenditure ?? 0,
                },
            ];
        });
    }
}

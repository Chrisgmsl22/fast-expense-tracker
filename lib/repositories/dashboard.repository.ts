import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import type { CategorySpend } from "@/lib/domain/dashboard";

/** One card's my-share spend for the month (the spend-by-card bar/legend). */
export type CardSpend = {
    /** Stable key — the card id, or "cash" for the null-card rollup. */
    id: string;
    name: string;
    color: string;
    spent: number;
};

/** Cash (null `cardId`) rolls up under this id/label + the seeded Cash green. */
const CASH_ID = "cash";
const CASH_NAME = "Cash";
const CASH_COLOR = "#16a34a";

/**
 * Read-only aggregates for the dashboard — the "port". Returns raw summed
 * spend per category/card; the 50/25/25 math lives in `lib/domain/dashboard.ts`,
 * the assembly in `getDashboardSummary`. Mirrors the expense/income repositories
 * so an in-memory fake is swappable in tests.
 */
export interface DashboardRepository {
    /**
     * My-share spend (`actualExpenditure`) summed per category for the month,
     * with the slug/name/color + `isRelevant` the buckets and radar need.
     * Categories with no spend that month are omitted.
     */
    getCategorySpends(userId: string, month: string): Promise<CategorySpend[]>;
    /**
     * My-share spend summed per card for the month, high→low. Cash (null
     * `cardId`) rolls up as one "Cash" row. Cards with no spend are omitted.
     */
    getCardSpends(userId: string, month: string): Promise<CardSpend[]>;
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

        // One lookup for the metadata of just the categories with spend.
        const categories = await this.db.category.findMany({
            where: { id: { in: grouped.map((g) => g.categoryId) } },
            select: {
                id: true,
                slug: true,
                name: true,
                color: true,
                isRelevant: true,
            },
        });
        const meta = new Map(categories.map((c) => [c.id, c]));

        return grouped.flatMap((g) => {
            const c = meta.get(g.categoryId);
            // A grouped categoryId always resolves (FK), but guard the lookup.
            if (!c) return [];
            return [
                {
                    slug: c.slug,
                    name: c.name,
                    color: c.color,
                    isRelevant: c.isRelevant,
                    spent: g._sum.actualExpenditure ?? 0,
                },
            ];
        });
    }

    async getCardSpends(userId: string, month: string): Promise<CardSpend[]> {
        const { start, end } = getMonthRangeUtc(month);
        const grouped = await this.db.expense.groupBy({
            by: ["cardId"],
            where: { userId, date: { gte: start, lt: end } },
            _sum: { actualExpenditure: true },
        });
        if (grouped.length === 0) return [];

        const cardIds = grouped
            .map((g) => g.cardId)
            .filter((id): id is string => id !== null);
        const cards = await this.db.card.findMany({
            where: { id: { in: cardIds } },
            select: { id: true, name: true, color: true },
        });
        const meta = new Map(cards.map((c) => [c.id, c]));

        return grouped
            .map((g) => {
                const spent = g._sum.actualExpenditure ?? 0;
                // null cardId = cash. The `?? CASH` below is just defensive — an
                // FK guarantees a non-null cardId resolves to a card row.
                const card = g.cardId ? meta.get(g.cardId) : undefined;
                return {
                    id: g.cardId ?? CASH_ID,
                    name: card?.name ?? CASH_NAME,
                    color: card?.color ?? CASH_COLOR,
                    spent,
                };
            })
            .sort((a, b) => b.spent - a.spent);
    }
}

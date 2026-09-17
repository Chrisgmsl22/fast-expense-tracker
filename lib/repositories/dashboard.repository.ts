import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import { budgetForMonth } from "@/lib/domain/category";
import { SAVINGS_SLUG, type CategorySpend } from "@/lib/domain/dashboard";
import {
    BUDGET_FUNDING_FILTER,
    BUDGET_FUNDING_SOURCE,
} from "@/lib/domain/funding";
import { CASH_COLOR } from "@/lib/palette";

/** One card's my-share spend for the month (the spend-by-card bar/legend). */
export type CardSpend = {
    /** Stable key — the card id, or "cash" for the null-card rollup. */
    id: string;
    name: string;
    color: string;
    spent: number;
};

/** One category's budget status for the dashboard grid. */
export type CategoryBudgetItem = {
    slug: string;
    name: string;
    color: string;
    /** Effective limit for the viewed month (override ?? default); null = no limit. */
    monthlyBudget: number | null;
    spent: number;
    /** Total subcategories the category has. */
    subcatTotal: number;
    /** Distinct subcategories with spend this month ("N of M subcats"). */
    subcatWithSpend: number;
};

/** Cash (null `cardId`) rolls up under this id/label + the seeded Cash green. */
const CASH_ID = "cash";
const CASH_NAME = "Cash";

/** The orphaned-expense sentinel — excluded from the category grid. */
const UNASSIGNED_SLUG = "unassigned";

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
    /**
     * Per-category budget status for categories with spend this month
     * (Unassigned excluded), high→low: budget, spent, and "N of M subcats".
     */
    getCategoryBreakdown(
        userId: string,
        month: string,
    ): Promise<CategoryBudgetItem[]>;
    /** My-share total the budget filter excludes — surfaced so the spend stays visible (spec 0007 §3.1). */
    getNonIncomeFundedTotal(userId: string, month: string): Promise<number>;
}

export class PrismaDashboardRepository implements DashboardRepository {
    constructor(private readonly db: PrismaClient) {}

    async getCategorySpends(
        userId: string,
        month: string,
    ): Promise<CategorySpend[]> {
        const { start, end } = getMonthRangeUtc(month);
        // Reimbursing an expense changes ITS month, not the month the refund
        // arrived (spec 0007 §6): a closed month's spend can drop after the
        // fact. Intended — that month's income funded nothing here.
        const grouped = await this.db.expense.groupBy({
            by: ["categoryId"],
            where: {
                userId,
                date: { gte: start, lt: end },
                ...BUDGET_FUNDING_FILTER,
            },
            _sum: { actualExpenditure: true },
        });
        if (grouped.length === 0) return [];

        // One lookup for the metadata of just the categories with spend. Scoped
        // by userId (ADR-0022) as defense-in-depth — the ids already come from
        // the user's own expenses, but the filter keeps the read per-user.
        const categories = await this.db.category.findMany({
            where: { userId, id: { in: grouped.map((g) => g.categoryId) } },
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
            // Savings and partner payments are excluded HERE, in the query: both have
            // a null `cardId`, which this query reads as cash — BUG-1's phantom segment.
            // No funding filter (spec 0007 §3.2): the card saw the full charge anyway.
            where: {
                userId,
                date: { gte: start, lt: end },
                category: { slug: { not: SAVINGS_SLUG } },
                isPartnerPayment: false,
            },
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

    async getNonIncomeFundedTotal(
        userId: string,
        month: string,
    ): Promise<number> {
        const { start, end } = getMonthRangeUtc(month);
        const total = await this.db.expense.aggregate({
            where: {
                userId,
                date: { gte: start, lt: end },
                fundedFrom: { not: BUDGET_FUNDING_SOURCE },
            },
            _sum: { actualExpenditure: true },
        });
        return total._sum.actualExpenditure ?? 0;
    }

    async getCategoryBreakdown(
        userId: string,
        month: string,
    ): Promise<CategoryBudgetItem[]> {
        const { start, end } = getMonthRangeUtc(month);
        // Group by category + subcategory in one pass: category spend is the sum,
        // and distinct non-null subcategoryIds give "N subcats with spend".
        const grouped = await this.db.expense.groupBy({
            by: ["categoryId", "subcategoryId"],
            where: {
                userId,
                date: { gte: start, lt: end },
                ...BUDGET_FUNDING_FILTER,
            },
            _sum: { actualExpenditure: true },
        });
        if (grouped.length === 0) return [];

        const perCategory = new Map<
            string,
            { spent: number; subcats: Set<string> }
        >();
        for (const g of grouped) {
            const entry = perCategory.get(g.categoryId) ?? {
                spent: 0,
                subcats: new Set<string>(),
            };
            entry.spent += g._sum.actualExpenditure ?? 0;
            if (g.subcategoryId) entry.subcats.add(g.subcategoryId);
            perCategory.set(g.categoryId, entry);
        }

        const categoryIds = [...perCategory.keys()];
        const [categories, overrideRows] = await Promise.all([
            this.db.category.findMany({
                where: { userId, id: { in: categoryIds } },
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    color: true,
                    monthlyBudget: true,
                    _count: { select: { subcategories: true } },
                },
            }),
            // Per-month budget overrides for these categories (ADR-0016),
            // scoped to the signed-in user (ADR-0022).
            this.db.categoryBudget.findMany({
                where: { userId, month, categoryId: { in: categoryIds } },
                select: { categoryId: true, amount: true },
            }),
        ]);
        const overrides = new Map(
            overrideRows.map((o) => [o.categoryId, o.amount]),
        );

        return categories
            .filter((c) => c.slug !== UNASSIGNED_SLUG)
            .map((c) => {
                const entry = perCategory.get(c.id);
                return {
                    slug: c.slug,
                    name: c.name,
                    color: c.color,
                    // Effective limit for the viewed month: override ?? default.
                    monthlyBudget: budgetForMonth(
                        c.monthlyBudget,
                        overrides.get(c.id) ?? null,
                    ),
                    spent: entry?.spent ?? 0,
                    subcatTotal: c._count.subcategories,
                    subcatWithSpend: entry?.subcats.size ?? 0,
                };
            })
            .sort((a, b) => b.spent - a.spent);
    }
}

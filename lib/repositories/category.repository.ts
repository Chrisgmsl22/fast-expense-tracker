import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import type { SubcategorySpendRow } from "@/lib/domain/category";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";

/** Category metadata for the detail header + budget math. */
export type CategoryMeta = {
    id: string;
    slug: string;
    name: string;
    color: string;
    isRelevant: boolean;
    /** null = no budget set. */
    monthlyBudget: number | null;
};

/** Null-subcategory expenses roll up under this label ("Other" bucket). */
const OTHER_NAME = "Other";

/**
 * Read-only category-detail aggregates — the "port". Mirrors the other
 * repositories so an in-memory fake is swappable in tests; the presentation
 * math (percent-of-category, ordering) lives in `lib/domain/category.ts`.
 */
export interface CategoryRepository {
    /** Category metadata by slug, or null if no such category. */
    getBySlug(slug: string): Promise<CategoryMeta | null>;
    /**
     * My-share spend (`actualExpenditure`) summed per subcategory for the month,
     * including **every** subcategory of the category (zero-spend rows kept), plus
     * an "Other" row (id null) for null-subcategory expenses **only when it has
     * spend**. Unordered — the domain sorts.
     */
    getSubcategorySpends(
        userId: string,
        categoryId: string,
        month: string,
    ): Promise<SubcategorySpendRow[]>;
    /** The category's expenses for the month, date desc. */
    getExpensesForCategoryMonth(
        userId: string,
        categoryId: string,
        month: string,
    ): Promise<ExpenseListItem[]>;
}

export class PrismaCategoryRepository implements CategoryRepository {
    constructor(private readonly db: PrismaClient) {}

    getBySlug(slug: string): Promise<CategoryMeta | null> {
        return this.db.category.findUnique({
            where: { slug },
            select: {
                id: true,
                slug: true,
                name: true,
                color: true,
                isRelevant: true,
                monthlyBudget: true,
            },
        });
    }

    async getSubcategorySpends(
        userId: string,
        categoryId: string,
        month: string,
    ): Promise<SubcategorySpendRow[]> {
        const { start, end } = getMonthRangeUtc(month);
        const [grouped, subcategories] = await Promise.all([
            this.db.expense.groupBy({
                by: ["subcategoryId"],
                where: { userId, categoryId, date: { gte: start, lt: end } },
                _sum: { actualExpenditure: true },
            }),
            this.db.subcategory.findMany({
                where: { categoryId },
                select: { id: true, name: true },
            }),
        ]);

        const spentById = new Map<string | null, number>();
        for (const g of grouped) {
            spentById.set(g.subcategoryId, g._sum.actualExpenditure ?? 0);
        }

        // Every subcategory the category has — zero-spend rows kept (faint bars).
        const rows: SubcategorySpendRow[] = subcategories.map((s) => ({
            id: s.id,
            name: s.name,
            spent: spentById.get(s.id) ?? 0,
        }));

        // Null-subcategory expenses roll up as "Other" — only when they exist.
        const otherSpent = spentById.get(null) ?? 0;
        if (otherSpent > 0) {
            rows.push({ id: null, name: OTHER_NAME, spent: otherSpent });
        }

        return rows;
    }

    getExpensesForCategoryMonth(
        userId: string,
        categoryId: string,
        month: string,
    ): Promise<ExpenseListItem[]> {
        const { start, end } = getMonthRangeUtc(month);
        return this.db.expense.findMany({
            where: { userId, categoryId, date: { gte: start, lt: end } },
            orderBy: { date: "desc" },
            select: {
                id: true,
                date: true,
                description: true,
                amount: true,
                actualExpenditure: true,
                isShared: true,
                category: {
                    select: { id: true, slug: true, name: true, color: true },
                },
                subcategory: { select: { name: true } },
                card: { select: { name: true, color: true } },
            },
        });
    }
}

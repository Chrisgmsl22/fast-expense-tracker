import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import type { SubcategorySpendRow } from "@/lib/domain/category";
import {
    PARTNER_PAYMENT_CATEGORY_SLUG,
    PARTNER_PAYMENT_SUBCATEGORY_NAME,
} from "@/lib/domain/expense";
import {
    BUDGET_FUNDING_FILTER,
    isBudgetFunded,
    toFundingSource,
} from "@/lib/domain/funding";
import { cycleCloseAtOrAfter } from "@/lib/domain/settlement";
import { getCycleCloses } from "@/lib/repositories/cycle-closes";
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

/**
 * The row plus the budget filter's verdict, read from the RAW column:
 * `fundedFrom` maps an out-of-band value to `income` while SQL drops it, so a
 * predicate over it would miss the rows that most need explaining.
 */
export type CategoryExpenseListItem = Omit<ExpenseListItem, "subcategory"> & {
    /**
     * Subcategory names are not unique — `schema.prisma` has no constraint on
     * `(userId, categoryId, name)` — so "across M subcategories" must count ids.
     */
    subcategory: { id: string; name: string } | null;
    countedInBudget: boolean;
};

/** Null-subcategory expenses roll up under this label ("Other" bucket). */
const OTHER_NAME = "Other";

/**
 * Read-only category-detail aggregates — the "port". Mirrors the other
 * repositories so an in-memory fake is swappable in tests; the presentation
 * math (percent-of-category, ordering) lives in `lib/domain/category.ts`.
 */
export interface CategoryRepository {
    /**
     * Category metadata by slug for one user, or null if that user has no such
     * category. Slugs are per-user (ADR-0022), so `userId` is required — a user
     * can never resolve another user's category.
     */
    getBySlug(userId: string, slug: string): Promise<CategoryMeta | null>;
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
    ): Promise<CategoryExpenseListItem[]>;
    /**
     * Where a payment to the partner lands when the user picks nothing (spec 0007 §6a);
     * null when the user has no `combined-expenses` category. The lookup is BY NAME, so
     * a drifted constant silently files every payment with a null subcategory.
     */
    getPartnerPaymentDefaults(
        userId: string,
    ): Promise<PartnerPaymentDefaults | null>;
}

/** The category (and optional subcategory) a partner payment defaults to. */
export type PartnerPaymentDefaults = {
    categoryId: string;
    subcategoryId: string | null;
};

export class PrismaCategoryRepository implements CategoryRepository {
    constructor(private readonly db: PrismaClient) {}

    getBySlug(userId: string, slug: string): Promise<CategoryMeta | null> {
        return this.db.category.findUnique({
            where: { userId_slug: { userId, slug } },
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
                // Budget figures count only income-funded rows (spec 0007 §2),
                // same filter the dashboard reads use.
                where: {
                    userId,
                    categoryId,
                    date: { gte: start, lt: end },
                    ...BUDGET_FUNDING_FILTER,
                },
                _sum: { actualExpenditure: true },
            }),
            this.db.subcategory.findMany({
                where: { userId, categoryId },
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

    async getPartnerPaymentDefaults(
        userId: string,
    ): Promise<PartnerPaymentDefaults | null> {
        const category = await this.db.category.findUnique({
            where: {
                userId_slug: { userId, slug: PARTNER_PAYMENT_CATEGORY_SLUG },
            },
            select: {
                id: true,
                subcategories: {
                    where: { name: PARTNER_PAYMENT_SUBCATEGORY_NAME },
                    select: { id: true },
                    take: 1,
                },
            },
        });
        if (!category) return null;
        return {
            categoryId: category.id,
            subcategoryId: category.subcategories[0]?.id ?? null,
        };
    }

    /**
     * `cycleClosedAt` is resolved here too, through the same helpers the expense
     * repository uses: hardcoding null would put a false fact on the row.
     */
    async getExpensesForCategoryMonth(
        userId: string,
        categoryId: string,
        month: string,
    ): Promise<CategoryExpenseListItem[]> {
        const { start, end } = getMonthRangeUtc(month);
        // No funding filter: this is the LIST, not a total. A savings-funded row
        // still belongs on screen (badged); only the aggregates above skip it.
        const [rows, closes] = await Promise.all([
            this.db.expense.findMany({
                where: { userId, categoryId, date: { gte: start, lt: end } },
                orderBy: { date: "desc" },
                select: {
                    id: true,
                    date: true,
                    description: true,
                    amount: true,
                    actualExpenditure: true,
                    isShared: true,
                    fundedFrom: true,
                    isPartnerPayment: true,
                    createdAt: true,
                    category: {
                        select: {
                            id: true,
                            slug: true,
                            name: true,
                            color: true,
                        },
                    },
                    subcategory: { select: { id: true, name: true } },
                    card: { select: { name: true, color: true } },
                },
            }),
            getCycleCloses(this.db, userId),
        ]);
        return rows.map(({ createdAt, ...item }) => ({
            ...item,
            fundedFrom: toFundingSource(item.fundedFrom),
            // Read before the narrowing above, which would hide an out-of-band
            // value behind `income` and take the row out of both figures.
            countedInBudget: isBudgetFunded(item.fundedFrom),
            cycleClosedAt: cycleCloseAtOrAfter(closes, createdAt),
        }));
    }
}

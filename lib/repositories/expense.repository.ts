import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";

export type ExpenseListItem = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    actualExpenditure: number;
    isShared: boolean;
    category: { id: string; slug: string; name: string; color: string };
    subcategory: { name: string } | null;
    card: { name: string; color: string } | null;
};

/** Full editable shape of one expense — what the edit form prefills. */
export type ExpenseEditable = {
    id: string;
    date: Date;
    amount: number;
    categoryId: string;
    subcategoryId: string | null;
    cardId: string | null;
    description: string;
    notes: string | null;
    isShared: boolean;
    yourPercentage: number;
    paidBy: string;
};

/**
 * Server-owned fields written on create and update. Server-computed values
 * (`actualExpenditure`, the UTC `date`) are resolved by the caller; the owner
 * and immutable defaults (`isRecurring`, original-currency columns) are set by
 * the adapter, not passed in.
 */
export type ExpenseWriteData = {
    categoryId: string;
    subcategoryId: string | null;
    cardId: string | null;
    date: Date;
    description: string;
    amount: number;
    isShared: boolean;
    yourPercentage: number;
    actualExpenditure: number;
    paidBy: "you" | "gf";
    notes: string | null;
};

/**
 * Data-access contract for expenses — the "port". Callers (actions, pages)
 * depend on this interface, never on Prisma directly, so any implementation
 * (Prisma, an in-memory fake in tests, a future API client) is swappable.
 *
 * `getSubcategoryCategoryId` is a validation-support lookup that lives here
 * pragmatically; if subcategory access grows it earns its own repository.
 */
export interface ExpenseRepository {
    getById(userId: string, id: string): Promise<ExpenseEditable | null>;
    getForMonth(userId: string, month: string): Promise<ExpenseListItem[]>;
    getSubcategoryCategoryId(subcategoryId: string): Promise<string | null>;
    insert(userId: string, data: ExpenseWriteData): Promise<{ id: string }>;
    updateForUser(
        id: string,
        userId: string,
        data: ExpenseWriteData,
    ): Promise<number>;
}

/**
 * Prisma-backed implementation — the only place expense queries live. The
 * `PrismaClient` is injected via the constructor (not imported), so the class
 * has no knowledge of the app's singleton and is trivially testable with a stub.
 */
export class PrismaExpenseRepository implements ExpenseRepository {
    constructor(private readonly db: PrismaClient) {}

    getById(userId: string, id: string): Promise<ExpenseEditable | null> {
        return this.db.expense.findFirst({
            where: { id, userId },
            select: {
                id: true,
                date: true,
                amount: true,
                categoryId: true,
                subcategoryId: true,
                cardId: true,
                description: true,
                notes: true,
                isShared: true,
                yourPercentage: true,
                paidBy: true,
            },
        });
    }

    getForMonth(userId: string, month: string): Promise<ExpenseListItem[]> {
        const { start, end } = getMonthRangeUtc(month);
        return this.db.expense.findMany({
            where: { userId, date: { gte: start, lt: end } },
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

    async getSubcategoryCategoryId(
        subcategoryId: string,
    ): Promise<string | null> {
        const sub = await this.db.subcategory.findUnique({
            where: { id: subcategoryId },
            select: { categoryId: true },
        });
        return sub?.categoryId ?? null;
    }

    insert(userId: string, data: ExpenseWriteData): Promise<{ id: string }> {
        return this.db.expense.create({
            data: {
                userId,
                ...data,
                isRecurring: false,
                originalAmount: null,
                originalCurrency: null,
            },
            select: { id: true },
        });
    }

    /**
     * `updateMany` (not `update`) so the where-clause carries `userId` alongside
     * `id`: Prisma's `update` only accepts unique fields in `where`, so it can't
     * filter by owner. A row that isn't the signed-in user's matches nothing,
     * the count stays 0, and the caller reports not-found instead of mutating
     * another user's data (IDOR guard).
     */
    async updateForUser(
        id: string,
        userId: string,
        data: ExpenseWriteData,
    ): Promise<number> {
        const result = await this.db.expense.updateMany({
            where: { id, userId },
            data,
        });
        return result.count;
    }
}

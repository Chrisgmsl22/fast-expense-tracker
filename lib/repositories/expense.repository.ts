import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import { cycleCloseAtOrAfter } from "@/lib/domain/settlement";
import { getCycleCloses } from "@/lib/repositories/cycle-closes";

export type ExpenseListItem = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    actualExpenditure: number;
    isShared: boolean;
    /** Money you SENT the partner — both consumption and cash out, one row. */
    isPartnerPayment: boolean;
    /**
     * The close instant of this row's cycle, null while it is open. The LIST carries it
     * so a frozen row can drop its controls instead of failing after the submit.
     */
    cycleClosedAt: Date | null;
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
    /**
     * The row's STORED share, never a recomputation: the closed-cycle guard and the
     * settlement balance both read this column and must not disagree on a legacy row.
     */
    actualExpenditure: number;
    paidBy: string;
    /** Whether this row is money you sent the partner (spec 0007 §6b). */
    isPartnerPayment: boolean;
    /**
     * The close instant of the cycle this row belongs to, null while it is open (spec
     * 0007 §3.5). An expense has no marker column, so the repository derives it. A
     * marker alone does not freeze a row — pair it with `movesSettlementBalance`.
     */
    cycleClosedAt: Date | null;
};

/**
 * Server-owned fields written on create and update. Server-computed values
 * (`actualExpenditure`, the UTC `date`) are resolved by the caller; the owner
 * and immutable defaults (`isRecurring`, original-currency columns) are set by
 * the adapter, not passed in.
 *
 * `isPartnerPayment` is deliberately absent: it is set once, at insert, so an edit
 * cannot silently turn a payment into an ordinary purchase.
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

/** What `insert` takes: the update shape plus the write-once payment marker. */
export type ExpenseInsertData = ExpenseWriteData & {
    isPartnerPayment: boolean;
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
    insert(userId: string, data: ExpenseInsertData): Promise<{ id: string }>;
    updateForUser(
        id: string,
        userId: string,
        data: ExpenseWriteData,
    ): Promise<number>;
    /** Delete one expense, scoped by owner. Returns rows affected (0 = not the user's). */
    deleteForUser(userId: string, id: string): Promise<number>;
}

/**
 * Prisma-backed implementation — the only place expense queries live. The
 * `PrismaClient` is injected via the constructor (not imported), so the class
 * has no knowledge of the app's singleton and is trivially testable with a stub.
 */
export class PrismaExpenseRepository implements ExpenseRepository {
    constructor(private readonly db: PrismaClient) {}

    async getById(userId: string, id: string): Promise<ExpenseEditable | null> {
        const row = await this.db.expense.findFirst({
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
                actualExpenditure: true,
                paidBy: true,
                isPartnerPayment: true,
                createdAt: true,
            },
        });
        if (!row) return null;
        const { createdAt, ...editable } = row;
        return {
            ...editable,
            cycleClosedAt: cycleCloseAtOrAfter(
                await getCycleCloses(this.db, userId),
                createdAt,
            ),
        };
    }

    async getForMonth(
        userId: string,
        month: string,
    ): Promise<ExpenseListItem[]> {
        const { start, end } = getMonthRangeUtc(month);
        const [rows, closes] = await Promise.all([
            this.db.expense.findMany({
                where: { userId, date: { gte: start, lt: end } },
                orderBy: { date: "desc" },
                select: {
                    id: true,
                    date: true,
                    description: true,
                    amount: true,
                    actualExpenditure: true,
                    isShared: true,
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
                    subcategory: { select: { name: true } },
                    card: { select: { name: true, color: true } },
                },
            }),
            getCycleCloses(this.db, userId),
        ]);
        return rows.map(({ createdAt, ...item }) => ({
            ...item,
            cycleClosedAt: cycleCloseAtOrAfter(closes, createdAt),
        }));
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

    insert(userId: string, data: ExpenseInsertData): Promise<{ id: string }> {
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

    /**
     * `deleteMany`, so the where-clause can carry `userId` and a row that isn't the
     * user's matches nothing (IDOR guard). The closed-cycle refusal is NOT here: it
     * needs facts the caller holds, and a silent zero count gives no message.
     */
    async deleteForUser(userId: string, id: string): Promise<number> {
        const result = await this.db.expense.deleteMany({
            where: { id, userId },
        });
        return result.count;
    }
}

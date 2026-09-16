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
     * Same fact, same meaning as `ExpenseEditable.cycleClosedAt`: the close
     * instant of this row's cycle, null while that cycle is open.
     *
     * The LIST carries it so the screen can drop the edit/delete controls on a
     * frozen row, the way the settlement journal does. Without it the buttons
     * render, the user fills in a dialog, and the refusal arrives after the
     * submit — a control that exists only to fail.
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
     * The row's STORED share, not a recomputation of it. The closed-cycle guard
     * asks `movesSettlementBalance` about this row, and the settlement read sums
     * this very column — recomputing it from `amount × yourPercentage` would let
     * the guard and the balance disagree about a legacy row that carries drift.
     */
    actualExpenditure: number;
    paidBy: string;
    /** Whether this row is money you sent the partner (spec 0007 §6b). */
    isPartnerPayment: boolean;
    /**
     * Set when this row belongs to a settlement cycle that has been CLOSED —
     * the instant of that close (spec 0007 §3.5). Null while the row is in the
     * open cycle.
     *
     * It rides on the row, the way `MovementEditable.closedAt` does, so every
     * caller learns the row is frozen without asking a second question. An
     * expense carries no marker column of its own: cycle membership is its
     * `createdAt` against the sequence of close instants, so the repository
     * resolves it here rather than leaving each action to re-derive it.
     *
     * A marker alone does NOT freeze the row: a cycle counts only the rows that
     * move the couple balance, so the caller pairs this with
     * `movesSettlementBalance`. Freezing on the marker alone locks every expense
     * ever entered before any close — see that helper.
     */
    cycleClosedAt: Date | null;
};

/**
 * Server-owned fields written on create and update. Server-computed values
 * (`actualExpenditure`, the UTC `date`) are resolved by the caller; the owner
 * and immutable defaults (`isRecurring`, original-currency columns) are set by
 * the adapter, not passed in.
 *
 * `isPartnerPayment` is deliberately absent: it is set once, at insert. An
 * update never writes it, so editing a payment through the ordinary expense form
 * cannot silently turn it into an ordinary purchase — which would drop it out of
 * the settlement balance without a word.
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
     * `deleteMany` (not `delete`) for the same reason `updateForUser` uses
     * `updateMany`: the where-clause carries `userId`, so a row that isn't the
     * signed-in user's matches nothing and the count stays 0 (IDOR guard).
     *
     * The closed-cycle refusal is NOT here. An expense has no marker column, so
     * freezing it needs the close instant AND the question of whether the row
     * moved that cycle's balance at all — the caller already holds both, on
     * `ExpenseEditable`, and refuses with a `cycle_closed` message the user can
     * act on, which a silent zero count could not give them.
     */
    async deleteForUser(userId: string, id: string): Promise<number> {
        const result = await this.db.expense.deleteMany({
            where: { id, userId },
        });
        return result.count;
    }
}

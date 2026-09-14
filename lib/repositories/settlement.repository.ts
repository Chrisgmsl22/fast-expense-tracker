import type { PrismaClient } from "@prisma/client";

import type { MovementType } from "@/lib/domain/movement";
import { CYCLE_CLOSING_TYPES } from "@/lib/domain/settlement";

/** An expense the couple-balance math reads (all are the user's own — ADR-0020). */
export type SettlementExpenseRow = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    actualExpenditure: number;
    isShared: boolean;
    /** Entry time: what cycle membership compares, and the same-`date` tie-break. */
    createdAt: Date;
};

/** A movement the couple-balance math reads. */
export type SettlementMovementRow = {
    id: string;
    date: Date;
    amount: number;
    type: MovementType;
    /** Free-text label — the "I owe {partner}" debt's description, if any. */
    note: string | null;
    /** Entry time: what cycle membership compares, and the same-`date` tie-break. */
    createdAt: Date;
    /**
     * Set when this transfer closed a settlement cycle. It travels WITH the row
     * so every view knows the row is frozen without being told (spec 0007 §3.5).
     */
    closedAt: Date | null;
};

export type SettlementWindowRows = {
    expenses: SettlementExpenseRow[];
    movements: SettlementMovementRow[];
};

/** The transfer that closed a cycle — the boundary between two cycles. */
export type SettlementCycleMarker = {
    id: string;
    /** The transfer's own date, for display ("closed on"). */
    date: Date;
    /**
     * The boundary itself — the instant the user confirmed the close, NOT the
     * transfer's entry time. Rows entered up to here were counted in the balance
     * the user saw as zero, so they belong to the cycle being closed.
     */
    closedAt: Date;
    amount: number;
};

/**
 * Read-only source for the settlement balance — the "port". Returns the raw
 * expense + movement rows in a UTC window; the netting + journal assembly live
 * in `getSettlement`, the math in `lib/domain/settlement`. Mirrors the other
 * repositories so an in-memory fake is swappable in tests (ADR-0015).
 */
export interface SettlementRepository {
    /** All expenses + movements in the half-open UTC window `[start, end)`, newest first. */
    getForWindow(
        userId: string,
        start: Date,
        end: Date,
    ): Promise<SettlementWindowRows>;

    /**
     * Rows by ENTRY time — `createdAt` in `(after, through]` — newest first by
     * date. This is cycle membership (spec 0007 §3.5): a row entered today but
     * dated last week belongs to the cycle open today, not to the closed one its
     * date falls inside. `null` leaves that end unbounded.
     */
    getForCreatedRange(
        userId: string,
        after: Date | null,
        through: Date | null,
    ): Promise<SettlementWindowRows>;

    /** Every cycle-closing marker for the user, oldest first. */
    getCycleMarkers(userId: string): Promise<SettlementCycleMarker[]>;

    /**
     * Record `closedAt` — the close instant — on one transfer. Returns rows
     * affected: 0 when the row isn't the user's, is already a marker (a double
     * submit), or isn't a transfer.
     */
    markCycleClose(
        userId: string,
        movementId: string,
        closedAt: Date,
    ): Promise<number>;
}

export class PrismaSettlementRepository implements SettlementRepository {
    constructor(private readonly db: PrismaClient) {}

    async getForWindow(
        userId: string,
        start: Date,
        end: Date,
    ): Promise<SettlementWindowRows> {
        const [expenses, movements] = await Promise.all([
            this.db.expense.findMany({
                where: { userId, date: { gte: start, lt: end } },
                // Newest first, `createdAt` breaking a same-date tie — the order
                // both the journal and the breakdown rows keep.
                orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                select: {
                    id: true,
                    date: true,
                    description: true,
                    amount: true,
                    actualExpenditure: true,
                    isShared: true,
                    createdAt: true,
                },
            }),
            this.db.movement.findMany({
                where: { userId, date: { gte: start, lt: end } },
                // Newest first, `createdAt` breaking a same-date tie — the order
                // both the journal and the breakdown rows keep.
                orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    type: true,
                    note: true,
                    createdAt: true,
                    closedAt: true,
                },
            }),
        ]);
        // `type` is a free-form string column; narrow to the domain union here.
        return {
            expenses,
            movements: movements.map((m) => ({
                ...m,
                type: m.type as MovementType,
            })),
        };
    }

    async getForCreatedRange(
        userId: string,
        after: Date | null,
        through: Date | null,
    ): Promise<SettlementWindowRows> {
        // `createdAt`, NOT `date` — cycle membership is entry time (spec 0007
        // §3.5). Half-open on the left, closed on the right, so the closing
        // transfer belongs to the cycle it closed and nothing lands in two.
        const createdAt = {
            ...(after ? { gt: after } : {}),
            ...(through ? { lte: through } : {}),
        };
        const range = Object.keys(createdAt).length > 0 ? { createdAt } : {};

        const [expenses, movements] = await Promise.all([
            this.db.expense.findMany({
                where: { userId, ...range },
                // Rows still DISPLAY by their own date, newest first.
                orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                select: {
                    id: true,
                    date: true,
                    description: true,
                    amount: true,
                    actualExpenditure: true,
                    isShared: true,
                    createdAt: true,
                },
            }),
            this.db.movement.findMany({
                where: { userId, ...range },
                orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    type: true,
                    note: true,
                    createdAt: true,
                    closedAt: true,
                },
            }),
        ]);
        return {
            expenses,
            movements: movements.map((m) => ({
                ...m,
                type: m.type as MovementType,
            })),
        };
    }

    async getCycleMarkers(userId: string): Promise<SettlementCycleMarker[]> {
        const rows = await this.db.movement.findMany({
            where: { userId, closedAt: { not: null } },
            orderBy: { closedAt: "asc" },
            select: { id: true, date: true, closedAt: true, amount: true },
        });
        // `closedAt` is nullable in the schema; the where-clause already
        // excluded the nulls, so narrow the type here at the boundary.
        return rows.map((r) => ({ ...r, closedAt: r.closedAt as Date }));
    }

    /**
     * `updateMany` (not `update`) so the where-clause carries `userId` and the
     * preconditions: a row that isn't the user's, is already a marker, or isn't
     * a transfer matches nothing and the count stays 0. That makes a double
     * submit a no-op instead of a second marker, and backs the DB CHECK.
     */
    async markCycleClose(
        userId: string,
        movementId: string,
        closedAt: Date,
    ): Promise<number> {
        const result = await this.db.movement.updateMany({
            where: {
                id: movementId,
                userId,
                closedAt: null,
                type: { in: [...CYCLE_CLOSING_TYPES] },
            },
            data: { closedAt },
        });
        return result.count;
    }
}

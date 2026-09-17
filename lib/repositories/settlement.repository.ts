import type { PrismaClient } from "@prisma/client";

import {
    toTransferFundingSource,
    type TransferFundingSource,
} from "@/lib/domain/funding";
import type { MovementType } from "@/lib/domain/movement";
import {
    CYCLE_CLOSING_TYPES,
    type SettlementRowRef,
} from "@/lib/domain/settlement";
import {
    getCycleMarkerRows,
    type SettlementCycleMarker,
} from "@/lib/repositories/cycle-closes";

/** An expense the couple-balance math reads. */
export type SettlementExpenseRow = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    actualExpenditure: number;
    isShared: boolean;
    /**
     * Money you SENT the partner — the "you paid her" side, which draws the balance
     * DOWN. An ordinary expense contributes her share and pushes it up: opposite signs.
     */
    isPartnerPayment: boolean;
    /**
     * Payment rows only: which money funded it, for the badge and the edit prefill.
     * Never read for the balance — a payment from savings still reached her.
     */
    fundedFrom: TransferFundingSource;
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
    /**
     * Read for the badge and the edit prefill, **never** for the balance: paying
     * her from savings still reached her, so `inputsFrom` nets on `amount` alone
     * (spec 0007 §3.1).
     */
    fundedFrom: TransferFundingSource;
    /** Entry time: what cycle membership compares, and the same-`date` tie-break. */
    createdAt: Date;
    /** Set when this transfer closed a settlement cycle, so the row is frozen (spec 0007 §3.5). */
    closedAt: Date | null;
};

export type SettlementWindowRows = {
    expenses: SettlementExpenseRow[];
    movements: SettlementMovementRow[];
};

export type { SettlementCycleMarker };

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
     * Rows by ENTRY time — `createdAt` in `(after, through]` — newest first by date. A
     * row entered today but dated last week belongs to the cycle open today. `null`
     * leaves that end unbounded.
     */
    getForCreatedRange(
        userId: string,
        after: Date | null,
        through: Date | null,
    ): Promise<SettlementWindowRows>;

    /** Every cycle-closing marker for the user, both tables, oldest first. */
    getCycleMarkers(userId: string): Promise<SettlementCycleMarker[]>;

    /**
     * Record `closedAt` on one row, in the table `marker.kind` names. Returns rows
     * affected: 0 when the row isn't the user's, is already a marker (a double submit),
     * or cannot carry one — a movement that isn't a transfer, an expense that isn't a
     * payment.
     */
    markCycleClose(
        userId: string,
        marker: SettlementRowRef,
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
                orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                select: {
                    id: true,
                    date: true,
                    description: true,
                    amount: true,
                    actualExpenditure: true,
                    isShared: true,
                    isPartnerPayment: true,
                    fundedFrom: true,
                    createdAt: true,
                },
            }),
            this.db.movement.findMany({
                where: { userId, date: { gte: start, lt: end } },
                orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    type: true,
                    note: true,
                    fundedFrom: true,
                    createdAt: true,
                    closedAt: true,
                },
            }),
        ]);
        return {
            expenses: expenses.map((e) => ({
                ...e,
                fundedFrom: toTransferFundingSource(e.fundedFrom),
            })),
            movements: movements.map((m) => ({
                ...m,
                type: m.type as MovementType,
                fundedFrom: toTransferFundingSource(m.fundedFrom),
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
                    isPartnerPayment: true,
                    fundedFrom: true,
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
                    fundedFrom: true,
                    createdAt: true,
                    closedAt: true,
                },
            }),
        ]);
        return {
            expenses: expenses.map((e) => ({
                ...e,
                fundedFrom: toTransferFundingSource(e.fundedFrom),
            })),
            movements: movements.map((m) => ({
                ...m,
                type: m.type as MovementType,
                fundedFrom: toTransferFundingSource(m.fundedFrom),
            })),
        };
    }

    async getCycleMarkers(userId: string): Promise<SettlementCycleMarker[]> {
        return getCycleMarkerRows(this.db, userId);
    }

    /**
     * `updateMany`, so the where-clause can carry `userId` and the preconditions; a
     * double submit then matches nothing instead of writing a second marker.
     */
    async markCycleClose(
        userId: string,
        marker: SettlementRowRef,
        closedAt: Date,
    ): Promise<number> {
        if (marker.kind === "expense") {
            const result = await this.db.expense.updateMany({
                where: {
                    id: marker.id,
                    userId,
                    closedAt: null,
                    isPartnerPayment: true,
                },
                data: { closedAt },
            });
            return result.count;
        }
        const result = await this.db.movement.updateMany({
            where: {
                id: marker.id,
                userId,
                closedAt: null,
                type: { in: [...CYCLE_CLOSING_TYPES] },
            },
            data: { closedAt },
        });
        return result.count;
    }
}

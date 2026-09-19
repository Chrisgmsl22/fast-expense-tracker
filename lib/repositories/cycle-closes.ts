import type { PrismaClient } from "@prisma/client";

import type { SettlementRowRef } from "@/lib/domain/settlement";

/**
 * The row that closed a cycle — the boundary between two cycles. Either table can hold
 * one: a transfer, or the payment-expense that squared the balance (spec 0007 §6b).
 */
export type SettlementCycleMarker = SettlementRowRef & {
    /** The row's own date, for display ("closed on"). */
    date: Date;
    /**
     * The boundary itself — the instant the user confirmed the close, NOT the row's
     * entry time. Rows entered up to here belong to the cycle being closed.
     */
    closedAt: Date;
    /** What it took to square the cycle: the transfer's amount, or what you sent her. */
    amount: number;
};

/**
 * The only reader that queries both tables; everything else projects from it.
 */
export async function getCycleMarkerRows(
    db: PrismaClient,
    userId: string,
): Promise<SettlementCycleMarker[]> {
    const [movements, expenses] = await Promise.all([
        db.movement.findMany({
            where: { userId, closedAt: { not: null } },
            select: { id: true, date: true, closedAt: true, amount: true },
        }),
        db.expense.findMany({
            where: { userId, closedAt: { not: null } },
            select: {
                id: true,
                date: true,
                closedAt: true,
                // What actually reached her — the figure the balance counts
                // for a payment row (spec 0007 §6b).
                actualExpenditure: true,
            },
        }),
    ]);
    // `closedAt` is nullable in the schema; the where-clauses already
    // excluded the nulls, so narrow the type here at the boundary.
    return [
        ...movements.map((m) => ({
            id: m.id,
            kind: "movement" as const,
            date: m.date,
            closedAt: m.closedAt as Date,
            amount: m.amount,
        })),
        ...expenses.map((e) => ({
            id: e.id,
            kind: "expense" as const,
            date: e.date,
            closedAt: e.closedAt as Date,
            amount: e.actualExpenditure,
        })),
    ].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
}

/**
 * Every settlement-cycle close instant this user has filed, oldest first. WHICH close
 * owns a row is decided by `cycleCloseAtOrAfter`, in pure domain code.
 */
export async function getCycleCloses(
    db: PrismaClient,
    userId: string,
): Promise<Date[]> {
    return (await getCycleMarkerRows(db, userId)).map((m) => m.closedAt);
}

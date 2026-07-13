import type { PrismaClient } from "@prisma/client";

import type { MovementType } from "@/lib/domain/movement";

/** An expense the couple-balance math reads (all are the user's own — ADR-0020). */
export type SettlementExpenseRow = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    actualExpenditure: number;
    isShared: boolean;
};

/** A movement the couple-balance math reads. */
export type SettlementMovementRow = {
    id: string;
    date: Date;
    amount: number;
    type: MovementType;
    fundedByPartner: boolean;
    /** Free-text label — the "I owe {partner}" debt's description, if any. */
    note: string | null;
};

export type SettlementWindowRows = {
    expenses: SettlementExpenseRow[];
    movements: SettlementMovementRow[];
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
                orderBy: { date: "desc" },
                select: {
                    id: true,
                    date: true,
                    description: true,
                    amount: true,
                    actualExpenditure: true,
                    isShared: true,
                },
            }),
            this.db.movement.findMany({
                where: { userId, date: { gte: start, lt: end } },
                orderBy: { date: "desc" },
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    type: true,
                    fundedByPartner: true,
                    note: true,
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
}

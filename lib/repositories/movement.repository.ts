import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import type { MovementType } from "@/lib/domain/movement";

/** One movement as the feed renders it. */
export type MovementListItem = {
    id: string;
    date: Date;
    amount: number;
    type: MovementType;
    fundedByPartner: boolean;
    card: { name: string; color: string } | null;
    note: string | null;
};

/** Server-owned fields written on create/update (the owner is passed separately). */
export type MovementWriteData = {
    date: Date;
    amount: number;
    type: MovementType;
    cardId: string | null;
    fundedByPartner: boolean;
    note: string | null;
};

/** One movement's editable fields — what an edit re-asserts / prefills. */
export type MovementEditable = {
    id: string;
    date: Date;
    amount: number;
    type: MovementType;
    cardId: string | null;
    note: string | null;
};

/**
 * Data-access contract for movements — the "port". Callers depend on this
 * interface, never on Prisma directly, so implementations are swappable
 * (Prisma, an in-memory fake in tests). See ADR-0015.
 */
export interface MovementRepository {
    getForMonth(userId: string, month: string): Promise<MovementListItem[]>;
    /** One movement scoped by owner (edit-guard + prefill); null = not the user's. */
    getById(userId: string, id: string): Promise<MovementEditable | null>;
    insert(userId: string, data: MovementWriteData): Promise<{ id: string }>;
    /** Update one movement, scoped by owner. Returns rows affected (0 = not the user's). */
    updateForUser(
        id: string,
        userId: string,
        data: MovementWriteData,
    ): Promise<number>;
    /** Delete one movement, scoped by owner. Returns rows affected (0 = not the user's). */
    deleteForUser(userId: string, id: string): Promise<number>;
}

/** Prisma-backed implementation — the only place movement queries live. */
export class PrismaMovementRepository implements MovementRepository {
    constructor(private readonly db: PrismaClient) {}

    async getForMonth(
        userId: string,
        month: string,
    ): Promise<MovementListItem[]> {
        const { start, end } = getMonthRangeUtc(month);
        const rows = await this.db.movement.findMany({
            // `gf_fronted` is a settlement-only debt, not a cash event — it never
            // belongs in the month feed (ADR-0020). The settlement page reads it
            // through its own window repository instead.
            where: {
                userId,
                date: { gte: start, lt: end },
                type: { not: "gf_fronted" },
            },
            orderBy: { date: "desc" },
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                fundedByPartner: true,
                note: true,
                card: { select: { name: true, color: true } },
            },
        });
        // `type` is a free-form string column; narrow it to the domain union at
        // the boundary so callers get the typed shape.
        return rows.map((r) => ({ ...r, type: r.type as MovementType }));
    }

    async getById(
        userId: string,
        id: string,
    ): Promise<MovementEditable | null> {
        const row = await this.db.movement.findFirst({
            where: { id, userId },
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                cardId: true,
                note: true,
            },
        });
        return row ? { ...row, type: row.type as MovementType } : null;
    }

    insert(userId: string, data: MovementWriteData): Promise<{ id: string }> {
        return this.db.movement.create({
            data: { userId, ...data },
            select: { id: true },
        });
    }

    /**
     * `updateMany` (not `update`) so the where-clause carries `userId` alongside
     * `id`: a row that isn't the user's matches nothing, the count stays 0, and
     * the caller reports not-found instead of mutating another user's row (IDOR
     * guard) — mirrors the expense repository.
     */
    async updateForUser(
        id: string,
        userId: string,
        data: MovementWriteData,
    ): Promise<number> {
        const result = await this.db.movement.updateMany({
            where: { id, userId },
            data,
        });
        return result.count;
    }

    /**
     * `deleteMany` (not `delete`) so the where-clause carries `userId` alongside
     * `id`: a row that isn't the user's matches nothing and the count stays 0,
     * so the caller reports not-found instead of deleting another user's row
     * (IDOR guard).
     */
    async deleteForUser(userId: string, id: string): Promise<number> {
        const result = await this.db.movement.deleteMany({
            where: { id, userId },
        });
        return result.count;
    }
}

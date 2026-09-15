import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import {
    toTransferFundingSource,
    type TransferFundingSource,
} from "@/lib/domain/funding";
import type { MovementType } from "@/lib/domain/movement";

/** One movement as the feed renders it. */
export type MovementListItem = {
    id: string;
    date: Date;
    amount: number;
    type: MovementType;
    card: { name: string; color: string } | null;
    note: string | null;
    /** Meaningful on `gf_paid` only; every other type keeps the default. */
    fundedFrom: TransferFundingSource;
};

/** Server-owned fields written on create/update (the owner is passed separately). */
export type MovementWriteData = {
    date: Date;
    amount: number;
    type: MovementType;
    cardId: string | null;
    note: string | null;
    /**
     * Optional on purpose: only a transfer sets it. A card payment stays
     * source-agnostic (spec 0007 §3.2, ADR-0020 §6) and a `gf_fronted` debt
     * moved no cash, so those writes omit the field and the column default
     * applies — omission is the signal that the type is not source-tagged.
     */
    fundedFrom?: TransferFundingSource;
};

/** One movement's editable fields — what an edit re-asserts / prefills. */
export type MovementEditable = {
    id: string;
    date: Date;
    amount: number;
    type: MovementType;
    cardId: string | null;
    note: string | null;
    fundedFrom: TransferFundingSource;
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
            // Every movement of the month, `gf_fronted` included: a debt she
            // fronted is information the feed shows, so it's visible where the
            // user looks. It is still not a cash event — the feed totals sum
            // expenses plus `gf_paid` only, so a debt changes no figure, and it
            // never becomes an Expense, so budget/categories/cards are untouched
            // (ADR-0020). The settlement page keeps its own window repository.
            where: { userId, date: { gte: start, lt: end } },
            orderBy: { date: "desc" },
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                note: true,
                fundedFrom: true,
                card: { select: { name: true, color: true } },
            },
        });
        // `type` and `fundedFrom` are free-form string columns; narrow both to
        // their domain unions at the boundary so callers get the typed shape.
        return rows.map((r) => ({
            ...r,
            type: r.type as MovementType,
            fundedFrom: toTransferFundingSource(r.fundedFrom),
        }));
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
                fundedFrom: true,
            },
        });
        return row
            ? {
                  ...row,
                  type: row.type as MovementType,
                  fundedFrom: toTransferFundingSource(row.fundedFrom),
              }
            : null;
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

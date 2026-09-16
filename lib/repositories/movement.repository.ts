import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import type { MovementType } from "@/lib/domain/movement";
import { cycleCloseAtOrAfter } from "@/lib/domain/settlement";
import { getCycleCloses } from "@/lib/repositories/cycle-closes";

/** One movement as the feed renders it. */
export type MovementListItem = {
    id: string;
    date: Date;
    amount: number;
    type: MovementType;
    card: { name: string; color: string } | null;
    note: string | null;
    /**
     * Set when this transfer closed a settlement cycle — the row is the cycle's
     * marker (see `MovementEditable.closedAt`). It travels with the LIST row,
     * not just the editable one, so a feed can hide the controls the server will
     * refuse instead of offering a way out that is not there.
     */
    closedAt: Date | null;
    /**
     * Same fact, same meaning as `ExpenseEditable.cycleClosedAt`: the close
     * instant of the cycle this row belongs to, null while that cycle is open.
     *
     * This — not `closedAt` — is what freezes a row. A cycle counts debts and
     * transfers alike, but only a transfer may carry the marker, so `closedAt`
     * identifies one row per cycle and says nothing about the rest of it.
     */
    cycleClosedAt: Date | null;
};

/** Server-owned fields written on create/update (the owner is passed separately). */
export type MovementWriteData = {
    date: Date;
    amount: number;
    type: MovementType;
    cardId: string | null;
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
    /**
     * Set when this transfer closed a settlement cycle (spec 0007 §3.5) — it is
     * that cycle's marker. Editing its amount would rewrite what a closed cycle
     * settled, and deleting it would dissolve the boundary and merge that cycle
     * back into the open one.
     */
    closedAt: Date | null;
    /**
     * The close instant of the cycle this row BELONGS to, null while that cycle
     * is open — mirrors `ExpenseEditable.cycleClosedAt`, derived the same way
     * (this row's `createdAt` against the sequence of close instants).
     *
     * The marker column could never carry this fact. The DB CHECK allows
     * `closedAt` only on a transfer, so a `gf_fronted` debt never has one — and
     * scoping the writes on `closedAt: null` therefore froze the marker and
     * nothing else. A closed cycle counted the debts too, so deleting one
     * restated a settlement the user was told could not be reopened. Pair this
     * with `movementMovesSettlementBalance`, exactly as the expense side pairs
     * its own field with `movesSettlementBalance`: a card payment inside a
     * closed cycle moves no balance and stays fully editable.
     */
    cycleClosedAt: Date | null;
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
        const [rows, closes] = await Promise.all([
            this.db.movement.findMany({
                // `gf_fronted` is EXCLUDED: a debt she fronted is
                // settlement-only (spec 0007 §6b). It is provisional — something
                // she owes you can shrink or cancel it before any money moves —
                // so showing it beside real spending invites reading it as money
                // already gone. The settlement page reads its own window
                // repository and still shows it, still counts it, and still
                // edits it there.
                //
                // Filtered at the QUERY, not hidden at render: a row that never
                // arrives cannot be forgotten by a view written later.
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
                    note: true,
                    closedAt: true,
                    createdAt: true,
                    card: { select: { name: true, color: true } },
                },
            }),
            getCycleCloses(this.db, userId),
        ]);
        // `type` is a free-form string column; narrow it to the domain union at
        // the boundary so callers get the typed shape. `createdAt` is consumed
        // here — it exists to place the row in a cycle, not to be rendered.
        return rows.map(({ createdAt, ...r }) => ({
            ...r,
            type: r.type as MovementType,
            cycleClosedAt: cycleCloseAtOrAfter(closes, createdAt),
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
                closedAt: true,
                createdAt: true,
            },
        });
        if (!row) return null;
        const { createdAt, ...editable } = row;
        return {
            ...editable,
            type: editable.type as MovementType,
            cycleClosedAt: cycleCloseAtOrAfter(
                await getCycleCloses(this.db, userId),
                createdAt,
            ),
        };
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
     *
     * `closedAt: null` freezes a cycle MARKER here, at the data boundary: its
     * amount and direction are what a closed settlement says it settled, so no
     * edit path can rewrite them.
     *
     * It is a backstop for one row, not the freeze. Every OTHER row a closed
     * cycle counted is frozen by the actions, on `cycleClosedAt` +
     * `movementMovesSettlementBalance` — the same pair the expense actions use.
     * A where-clause cannot express it: cycle membership is a `createdAt`
     * comparison against a list of close instants, not a column.
     */
    async updateForUser(
        id: string,
        userId: string,
        data: MovementWriteData,
    ): Promise<number> {
        const result = await this.db.movement.updateMany({
            where: { id, userId, closedAt: null },
            data,
        });
        return result.count;
    }

    /**
     * `deleteMany` (not `delete`) so the where-clause carries `userId` alongside
     * `id`: a row that isn't the user's matches nothing and the count stays 0,
     * so the caller reports not-found instead of deleting another user's row
     * (IDOR guard).
     *
     * `closedAt: null` also protects a cycle marker: deleting it would dissolve
     * the boundary and silently merge a closed settlement into the open one.
     * The rest of a closed cycle is frozen by the action — see `updateForUser`.
     */
    async deleteForUser(userId: string, id: string): Promise<number> {
        const result = await this.db.movement.deleteMany({
            where: { id, userId, closedAt: null },
        });
        return result.count;
    }
}

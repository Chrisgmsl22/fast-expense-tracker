import type { PrismaClient } from "@prisma/client";

/** One card row for the Settings card list, with its usage flag. */
export type CardSettingsItem = {
    id: string;
    name: string;
    color: string;
    type: string;
    archivedAt: Date | null;
    /**
     * True when any `Expense`/`Movement` references the card — the Settings row
     * shows Archive (used) vs Delete (unused) up front from this, so the client
     * never has to guess (the delete action still re-checks server-side).
     */
    inUse: boolean;
};

/** Fields set when adding a card; `type` is immutable after creation. */
export type CardCreate = { name: string; type: string; color: string };

/** Editable fields on rename/recolor. */
export type CardUpdate = { name: string; color: string };

/**
 * Data-access contract for cards — the "port". Actions depend on this interface,
 * never on Prisma directly, so an in-memory fake is swappable in tests. Every
 * write is `userId`-scoped (IDOR guard): a row that isn't the signed-in user's
 * matches nothing, the count stays 0, and the caller reports not-found.
 */
export interface CardRepository {
    /** All of the user's cards (active first, then archived; each A→Z), with `inUse`. */
    listForSettings(userId: string): Promise<CardSettingsItem[]>;
    /** Count of the user's active (non-archived) cards — the add-cap check. */
    countActive(userId: string): Promise<number>;
    /** An active card matching `name` case-insensitively, or null (dup-name check). */
    findActiveByName(
        userId: string,
        name: string,
    ): Promise<{ id: string } | null>;
    create(userId: string, data: CardCreate): Promise<void>;
    /** Rename/recolor; returns the number of rows written (0 = not the user's card). */
    updateForUser(
        userId: string,
        id: string,
        data: CardUpdate,
    ): Promise<number>;
    /** Set `archivedAt` on an active card; returns rows written (0 = not found / already archived). */
    archiveForUser(userId: string, id: string): Promise<number>;
    /** How many `Expense`/`Movement` rows reference the card (for the user). */
    referenceCount(userId: string, id: string): Promise<number>;
    /** Hard-delete a card; returns rows deleted (0 = not the user's card). */
    deleteForUser(userId: string, id: string): Promise<number>;
    /** True when the card is the user's locked `type:"cash"` card. */
    isCash(userId: string, id: string): Promise<boolean>;
}

/**
 * Prisma-backed implementation — the only place card queries live. The
 * `PrismaClient` is injected via the constructor (not imported), so the class has
 * no knowledge of the app singleton and is trivially testable with a stub.
 */
export class PrismaCardRepository implements CardRepository {
    constructor(private readonly db: PrismaClient) {}

    async listForSettings(userId: string): Promise<CardSettingsItem[]> {
        const rows = await this.db.card.findMany({
            where: { userId },
            // Active (null archivedAt) first, then archived; each group A→Z.
            orderBy: [
                { archivedAt: { sort: "asc", nulls: "first" } },
                { name: "asc" },
            ],
            select: {
                id: true,
                name: true,
                color: true,
                type: true,
                archivedAt: true,
                _count: { select: { expenses: true, movements: true } },
            },
        });
        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            color: row.color,
            type: row.type,
            archivedAt: row.archivedAt,
            inUse: row._count.expenses + row._count.movements > 0,
        }));
    }

    countActive(userId: string): Promise<number> {
        return this.db.card.count({ where: { userId, archivedAt: null } });
    }

    findActiveByName(
        userId: string,
        name: string,
    ): Promise<{ id: string } | null> {
        return this.db.card.findFirst({
            where: {
                userId,
                archivedAt: null,
                name: { equals: name, mode: "insensitive" },
            },
            select: { id: true },
        });
    }

    async create(userId: string, data: CardCreate): Promise<void> {
        await this.db.card.create({
            data: {
                userId,
                name: data.name,
                type: data.type,
                color: data.color,
            },
        });
    }

    async updateForUser(
        userId: string,
        id: string,
        data: CardUpdate,
    ): Promise<number> {
        const result = await this.db.card.updateMany({
            where: { id, userId },
            data: { name: data.name, color: data.color },
        });
        return result.count;
    }

    async archiveForUser(userId: string, id: string): Promise<number> {
        const result = await this.db.card.updateMany({
            where: { id, userId, archivedAt: null },
            data: { archivedAt: new Date() },
        });
        return result.count;
    }

    async referenceCount(userId: string, id: string): Promise<number> {
        const [expenses, movements] = await Promise.all([
            this.db.expense.count({ where: { cardId: id, userId } }),
            this.db.movement.count({ where: { cardId: id, userId } }),
        ]);
        return expenses + movements;
    }

    async deleteForUser(userId: string, id: string): Promise<number> {
        const result = await this.db.card.deleteMany({ where: { id, userId } });
        return result.count;
    }

    async isCash(userId: string, id: string): Promise<boolean> {
        const card = await this.db.card.findFirst({
            where: { id, userId },
            select: { type: true },
        });
        return card?.type === "cash";
    }
}

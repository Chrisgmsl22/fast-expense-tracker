import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import {
    NO_BALANCE_CARD_TYPES,
    type CardHistoryEntry,
    type CardPeriodTotals,
    type CardTotals,
} from "@/lib/domain/card-balance";
import { SAVINGS_SLUG } from "@/lib/domain/dashboard";

// A Savings-category row is money set aside, not a purchase, even when it names a card.
const CARD_CHARGE_FILTER = { category: { slug: { not: SAVINGS_SLUG } } };

// Archived cards are retired: the Card balances page neither lists nor counts them.
const BALANCE_CARD_FILTER = {
    archivedAt: null,
    type: { notIn: [...NO_BALANCE_CARD_TYPES] },
};

const NO_TOTALS: CardTotals = { charged: 0, paid: 0, redeemed: 0 };

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

/** One card option in the expense form's picker. */
export type CardPickerItem = { id: string; name: string; color: string };

/** Fields set when adding a card; `type` is immutable after creation. */
export type CardCreate = { name: string; type: string; color: string };

/** Editable fields on a card edit (rename / recolor / retype). */
export type CardUpdate = { name: string; type: string; color: string };

/** One active card that can carry a balance, with its sums before and during a month. */
export type CardBalanceRow = CardPeriodTotals & {
    id: string;
    name: string;
    color: string;
    type: string;
};

/** One card's sums before a month, and its charges and payments inside it, unordered. */
export type CardMonthHistory = {
    before: CardTotals;
    entries: CardHistoryEntry[];
};

/**
 * Data-access contract for cards — the "port". Actions depend on this interface,
 * never on Prisma directly, so an in-memory fake is swappable in tests. Every
 * write is `userId`-scoped (IDOR guard): a row that isn't the signed-in user's
 * matches nothing, the count stays 0, and the caller reports not-found.
 */
export interface CardRepository {
    /** All of the user's cards (active first, then archived; each A→Z), with `inUse`. */
    listForSettings(userId: string): Promise<CardSettingsItem[]>;
    /**
     * The user's active cards for a picker, A→Z. Archived cards drop out here only;
     * history reads stay unfiltered so old expenses still resolve their card.
     */
    listActive(userId: string): Promise<CardPickerItem[]>;
    /** Count of the user's active (non-archived) cards — the add-cap check. */
    countActive(userId: string): Promise<number>;
    /** An active card matching `name` case-insensitively, or null (dup-name check). */
    findActiveByName(
        userId: string,
        name: string,
    ): Promise<{ id: string } | null>;
    /** The user's card by id (name + archive state), or null — the restore lookup. */
    findByIdForUser(
        userId: string,
        id: string,
    ): Promise<{ name: string; archivedAt: Date | null } | null>;
    create(userId: string, data: CardCreate): Promise<void>;
    /** Rename/recolor; returns the number of rows written (0 = not the user's card). */
    updateForUser(
        userId: string,
        id: string,
        data: CardUpdate,
    ): Promise<number>;
    /** Set `archivedAt` on an active card; returns rows written (0 = not found / already archived). */
    archiveForUser(userId: string, id: string): Promise<number>;
    /** Clear `archivedAt` on an archived card; returns rows written (0 = not found / already active). */
    restoreForUser(userId: string, id: string): Promise<number>;
    /** How many `Expense`/`Movement` rows reference the card (for the user). */
    referenceCount(userId: string, id: string): Promise<number>;
    /** Hard-delete a card; returns rows deleted (0 = not the user's card). */
    deleteForUser(userId: string, id: string): Promise<number>;
    /** True when the card is the user's locked `type:"cash"` card. */
    isCash(userId: string, id: string): Promise<boolean>;
    /**
     * Every active card that can carry a balance, A→Z, with its charged and paid
     * sums before `month` (CDMX) and inside it. Redemptions are not tracked yet, so 0.
     */
    listBalances(userId: string, month: string): Promise<CardBalanceRow[]>;
    /** One active balance card's month history; null for any other card. */
    getHistory(
        userId: string,
        cardId: string,
        month: string,
    ): Promise<CardMonthHistory | null>;
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
        const items = rows.map((row) => ({
            id: row.id,
            name: row.name,
            color: row.color,
            type: row.type,
            archivedAt: row.archivedAt,
            inUse: row._count.expenses + row._count.movements > 0,
        }));
        // Cash is the universal, always-present card, so it always renders last
        // regardless of name. A stable sort keeps every other card in the
        // active-first/A→Z order the query already produced.
        return items.sort(
            (a, b) => Number(a.type === "cash") - Number(b.type === "cash"),
        );
    }

    listActive(userId: string): Promise<CardPickerItem[]> {
        return this.db.card.findMany({
            where: { userId, archivedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, color: true },
        });
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

    findByIdForUser(
        userId: string,
        id: string,
    ): Promise<{ name: string; archivedAt: Date | null } | null> {
        return this.db.card.findFirst({
            where: { id, userId },
            select: { name: true, archivedAt: true },
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
            data: { name: data.name, type: data.type, color: data.color },
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

    async restoreForUser(userId: string, id: string): Promise<number> {
        const result = await this.db.card.updateMany({
            where: { id, userId, archivedAt: { not: null } },
            data: { archivedAt: null },
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

    async listBalances(
        userId: string,
        month: string,
    ): Promise<CardBalanceRow[]> {
        const cards = await this.db.card.findMany({
            where: { userId, ...BALANCE_CARD_FILTER },
            orderBy: { name: "asc" },
            select: { id: true, name: true, color: true, type: true },
        });
        if (cards.length === 0) return [];

        const cardIds = cards.map((c) => c.id);
        const { start, end } = getMonthRangeUtc(month);
        const [before, during] = await Promise.all([
            this.sumsByCard(userId, cardIds, { lt: start }),
            this.sumsByCard(userId, cardIds, { gte: start, lt: end }),
        ]);
        return cards.map((card) => ({
            ...card,
            before: before.get(card.id) ?? NO_TOTALS,
            during: during.get(card.id) ?? NO_TOTALS,
        }));
    }

    async getHistory(
        userId: string,
        cardId: string,
        month: string,
    ): Promise<CardMonthHistory | null> {
        const card = await this.db.card.findFirst({
            where: { id: cardId, userId, ...BALANCE_CARD_FILTER },
            select: { id: true },
        });
        if (!card) return null;

        const { start, end } = getMonthRangeUtc(month);
        const inMonth = { gte: start, lt: end };
        const [before, expenses, payments] = await Promise.all([
            this.sumsByCard(userId, [cardId], { lt: start }),
            this.db.expense.findMany({
                where: { userId, cardId, date: inMonth, ...CARD_CHARGE_FILTER },
                select: {
                    id: true,
                    date: true,
                    createdAt: true,
                    description: true,
                    amount: true,
                    isShared: true,
                    category: { select: { name: true } },
                },
            }),
            this.db.movement.findMany({
                where: { userId, cardId, date: inMonth, type: "card_payment" },
                select: {
                    id: true,
                    date: true,
                    createdAt: true,
                    amount: true,
                    note: true,
                },
            }),
        ]);

        return {
            before: before.get(cardId) ?? NO_TOTALS,
            entries: [
                ...expenses.map(
                    (e): CardHistoryEntry => ({
                        id: e.id,
                        kind: "charge",
                        date: e.date,
                        createdAt: e.createdAt,
                        description: e.description,
                        detail: e.category.name,
                        isShared: e.isShared,
                        amount: e.amount,
                    }),
                ),
                ...payments.map(
                    (m): CardHistoryEntry => ({
                        id: m.id,
                        kind: "payment",
                        date: m.date,
                        createdAt: m.createdAt,
                        description: null,
                        detail: m.note,
                        isShared: false,
                        amount: m.amount,
                    }),
                ),
            ],
        };
    }

    /**
     * Charged and paid per card for rows whose date falls in `date`, summed in the
     * database. Charged is the full `amount` whatever the split or funding source.
     */
    private async sumsByCard(
        userId: string,
        cardIds: string[],
        date: { gte?: Date; lt: Date },
    ): Promise<Map<string, CardTotals>> {
        const [charges, payments] = await Promise.all([
            this.db.expense.groupBy({
                by: ["cardId"],
                where: {
                    userId,
                    cardId: { in: cardIds },
                    date,
                    ...CARD_CHARGE_FILTER,
                },
                _sum: { amount: true },
            }),
            this.db.movement.groupBy({
                by: ["cardId"],
                where: {
                    userId,
                    type: "card_payment",
                    cardId: { in: cardIds },
                    date,
                },
                _sum: { amount: true },
            }),
        ]);
        const charged = new Map(
            charges.map((g) => [g.cardId, g._sum.amount ?? 0]),
        );
        const paid = new Map(
            payments.map((g) => [g.cardId, g._sum.amount ?? 0]),
        );
        return new Map(
            cardIds.map((id) => [
                id,
                {
                    charged: charged.get(id) ?? 0,
                    paid: paid.get(id) ?? 0,
                    redeemed: 0,
                },
            ]),
        );
    }
}

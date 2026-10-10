import {
    NO_BALANCE_CARD_TYPES,
    type CardPeriodTotals,
} from "@/lib/domain/card-balance";
import type {
    CardBalanceRow,
    CardCreate,
    CardMonthHistory,
    CardPickerItem,
    CardRepository,
    CardSettingsItem,
    CardUpdate,
} from "@/lib/repositories/card.repository";

const isBalanceCard = (card: {
    type: string;
    archivedAt: Date | null;
}): boolean =>
    card.archivedAt === null &&
    !(NO_BALANCE_CARD_TYPES as readonly string[]).includes(card.type);

const NONE = { charged: 0, paid: 0, redeemed: 0 };

type StoredCard = {
    id: string;
    userId: string;
    name: string;
    color: string;
    type: string;
    archivedAt: Date | null;
    /** Number of Expense/Movement rows referencing the card (for `inUse`/refs). */
    references: number;
};

let idCounter = 0;

/**
 * In-memory `CardRepository` for unit tests. Satisfies the exact contract the
 * Prisma adapter does, so an action driven by this fake exercises its real
 * orchestration (validate → authz → guards → persist) with zero database.
 * Mirrors `FakeSettingsRepository`.
 */
export class FakeCardRepository implements CardRepository {
    private readonly cards = new Map<string, StoredCard>();

    /** Flip on to make the next write throw, simulating a DB failure. */
    failOnWrite = false;

    /** Flip on to make the next read throw, simulating a DB failure. */
    failOnRead = false;

    /** Arrange helper: sums before and during the month per card id, for `listBalances`. */
    readonly periods = new Map<string, CardPeriodTotals>();

    /** Arrange helper: the month history per card id, for `getHistory`. */
    readonly histories = new Map<string, CardMonthHistory>();

    /** Every month a read asked for, in order. */
    readonly monthsRead: string[] = [];

    /** Every card created via `create`, in order. */
    readonly created: Array<{ userId: string; data: CardCreate }> = [];

    /** Arrange helper: seed a stored card and return its generated id. */
    seed(over: Partial<StoredCard> & { userId: string }): string {
        idCounter += 1;
        const id = over.id ?? `card-${idCounter}`;
        this.cards.set(id, {
            id,
            userId: over.userId,
            name: over.name ?? `Card ${idCounter}`,
            color: over.color ?? "#6b7280",
            type: over.type ?? "credit",
            archivedAt: over.archivedAt ?? null,
            references: over.references ?? 0,
        });
        return id;
    }

    async listForSettings(userId: string): Promise<CardSettingsItem[]> {
        return [...this.cards.values()]
            .filter((c) => c.userId === userId)
            .sort((a, b) => {
                // Cash always last; otherwise active before archived, then name.
                const aCash = a.type === "cash" ? 1 : 0;
                const bCash = b.type === "cash" ? 1 : 0;
                if (aCash !== bCash) return aCash - bCash;
                const aArchived = a.archivedAt ? 1 : 0;
                const bArchived = b.archivedAt ? 1 : 0;
                if (aArchived !== bArchived) return aArchived - bArchived;
                return a.name.localeCompare(b.name);
            })
            .map((c) => ({
                id: c.id,
                name: c.name,
                color: c.color,
                type: c.type,
                archivedAt: c.archivedAt,
                inUse: c.references > 0,
            }));
    }

    async listActive(userId: string): Promise<CardPickerItem[]> {
        return [...this.cards.values()]
            .filter((c) => c.userId === userId && c.archivedAt === null)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(({ id, name, color }) => ({ id, name, color }));
    }

    async countActive(userId: string): Promise<number> {
        return [...this.cards.values()].filter(
            (c) => c.userId === userId && c.archivedAt === null,
        ).length;
    }

    async findActiveByName(
        userId: string,
        name: string,
    ): Promise<{ id: string } | null> {
        const match = [...this.cards.values()].find(
            (c) =>
                c.userId === userId &&
                c.archivedAt === null &&
                c.name.toLowerCase() === name.toLowerCase(),
        );
        return match ? { id: match.id } : null;
    }

    async findByIdForUser(
        userId: string,
        id: string,
    ): Promise<{ name: string; archivedAt: Date | null } | null> {
        const card = this.cards.get(id);
        if (!card || card.userId !== userId) return null;
        return { name: card.name, archivedAt: card.archivedAt };
    }

    async create(userId: string, data: CardCreate): Promise<void> {
        if (this.failOnWrite) throw new Error("fake: create failed");
        this.seed({
            userId,
            name: data.name,
            color: data.color,
            type: data.type,
        });
        this.created.push({ userId, data });
    }

    async updateForUser(
        userId: string,
        id: string,
        data: CardUpdate,
    ): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: update failed");
        const card = this.cards.get(id);
        if (!card || card.userId !== userId) return 0;
        card.name = data.name;
        card.type = data.type;
        card.color = data.color;
        return 1;
    }

    async archiveForUser(userId: string, id: string): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: archive failed");
        const card = this.cards.get(id);
        if (!card || card.userId !== userId || card.archivedAt !== null) {
            return 0;
        }
        card.archivedAt = new Date();
        return 1;
    }

    async restoreForUser(userId: string, id: string): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: restore failed");
        const card = this.cards.get(id);
        if (!card || card.userId !== userId || card.archivedAt === null) {
            return 0;
        }
        card.archivedAt = null;
        return 1;
    }

    async referenceCount(userId: string, id: string): Promise<number> {
        const card = this.cards.get(id);
        if (!card || card.userId !== userId) return 0;
        return card.references;
    }

    async deleteForUser(userId: string, id: string): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: delete failed");
        const card = this.cards.get(id);
        if (!card || card.userId !== userId) return 0;
        this.cards.delete(id);
        return 1;
    }

    async isCash(userId: string, id: string): Promise<boolean> {
        const card = this.cards.get(id);
        return card?.userId === userId && card.type === "cash";
    }

    async listBalances(
        userId: string,
        month: string,
    ): Promise<CardBalanceRow[]> {
        if (this.failOnRead) throw new Error("fake: listBalances failed");
        this.monthsRead.push(month);
        return [...this.cards.values()]
            .filter((c) => c.userId === userId && isBalanceCard(c))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(({ id, name, color, type }) => ({
                id,
                name,
                color,
                type,
                ...(this.periods.get(id) ?? { before: NONE, during: NONE }),
            }));
    }

    async getHistory(
        userId: string,
        cardId: string,
        month: string,
    ): Promise<CardMonthHistory | null> {
        if (this.failOnRead) throw new Error("fake: getHistory failed");
        this.monthsRead.push(month);
        const card = this.cards.get(cardId);
        if (!card || card.userId !== userId || !isBalanceCard(card)) {
            return null;
        }
        return this.histories.get(cardId) ?? { before: NONE, entries: [] };
    }
}

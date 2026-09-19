import type {
    MovementEditable,
    MovementListItem,
    MovementRepository,
    MovementWriteData,
} from "@/lib/repositories/movement.repository";

type StoredMovement = {
    id: string;
    userId: string;
    /** Set when this transfer closed a settlement cycle — it is the marker. */
    closedAt: Date | null;
    /**
     * Mirrors `MovementEditable.cycleClosedAt`, taken as arranged state. A marker is
     * inside the cycle it closed, so `seed` fills this from `closedAt` unless the caller
     * sets it — seeding `closedAt` alone would arrange an impossible row.
     */
    cycleClosedAt: Date | null;
} & MovementWriteData;

/**
 * In-memory `MovementRepository` for unit tests. Satisfies the exact contract the
 * Prisma adapter does, so an action driven by this fake exercises its real
 * orchestration (validate → authz → persist → map) with zero database. Mirrors
 * `FakeIncomeRepository`.
 */
export class FakeMovementRepository implements MovementRepository {
    private readonly rows = new Map<string, StoredMovement>();
    private seq = 0;

    /** Flip on to make the next write/delete throw, simulating a DB failure. */
    failOnWrite = false;

    /** Every row inserted via `insert`, in order. */
    readonly inserts: StoredMovement[] = [];

    /** Every update applied via `updateForUser`, in order. */
    readonly updates: {
        id: string;
        userId: string;
        data: MovementWriteData;
    }[] = [];

    seed(
        id: string,
        userId: string,
        over: Partial<
            MovementWriteData & {
                closedAt: Date | null;
                cycleClosedAt: Date | null;
            }
        > = {},
    ): void {
        this.rows.set(id, {
            id,
            userId,
            date: new Date("2026-06-10T06:00:00Z"),
            amount: 100,
            type: "card_payment",
            cardId: null,
            note: null,
            closedAt: null,
            ...over,
            // Derived after the spread, so a caller that seeds only `closedAt` still gets a coherent row.
            cycleClosedAt:
                over.cycleClosedAt !== undefined
                    ? over.cycleClosedAt
                    : (over.closedAt ?? null),
        });
    }

    async getForMonth(userId: string): Promise<MovementListItem[]> {
        return (
            [...this.rows.values()]
                .filter((r) => r.userId === userId)
                // Mirror the Prisma adapter: `gf_fronted` is settlement-only and
                // never appears in the month feed (ADR-0020).
                .filter(
                    (r) => r.type !== "gf_fronted" && r.type !== "partner_debt",
                )
                .map((r) => ({
                    id: r.id,
                    date: r.date,
                    amount: r.amount,
                    type: r.type,
                    card: null,
                    note: r.note,
                    // Mirror the column default: a write that omits the field
                    // reads back as income, as Postgres would return it.
                    fundedFrom: r.fundedFrom ?? "income",
                    closedAt: r.closedAt,
                    cycleClosedAt: r.cycleClosedAt,
                }))
        );
    }

    async getById(
        userId: string,
        id: string,
    ): Promise<MovementEditable | null> {
        const row = this.rows.get(id);
        if (!row || row.userId !== userId) return null;
        return {
            id: row.id,
            date: row.date,
            amount: row.amount,
            type: row.type,
            cardId: row.cardId,
            note: row.note,
            fundedFrom: row.fundedFrom ?? "income",
            closedAt: row.closedAt,
            cycleClosedAt: row.cycleClosedAt,
        };
    }

    async insert(
        userId: string,
        data: MovementWriteData,
    ): Promise<{ id: string }> {
        if (this.failOnWrite) throw new Error("fake: insert failed");
        const row: StoredMovement = {
            id: `mv_${++this.seq}`,
            userId,
            closedAt: null,
            // A new row always lands in the OPEN cycle — there is no close at or
            // after the instant it was entered.
            cycleClosedAt: null,
            ...data,
        };
        this.rows.set(row.id, row);
        this.inserts.push(row);
        return { id: row.id };
    }

    async updateForUser(
        id: string,
        userId: string,
        data: MovementWriteData,
    ): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: update failed");
        const row = this.rows.get(id);
        // Mirrors the Prisma where-clause, cycle-marker guard included.
        if (!row || row.userId !== userId || row.closedAt) return 0;
        this.rows.set(id, { ...row, ...data });
        this.updates.push({ id, userId, data });
        return 1;
    }

    async deleteForUser(userId: string, id: string): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: delete failed");
        const row = this.rows.get(id);
        // Mirrors the Prisma where-clause, cycle-marker guard included.
        if (!row || row.userId !== userId || row.closedAt) return 0;
        this.rows.delete(id);
        return 1;
    }
}

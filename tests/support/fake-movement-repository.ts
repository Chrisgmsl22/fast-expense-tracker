import type {
    MovementListItem,
    MovementRepository,
    MovementWriteData,
} from "@/lib/repositories/movement.repository";

type StoredMovement = { id: string; userId: string } & MovementWriteData;

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

    seed(
        id: string,
        userId: string,
        over: Partial<MovementWriteData> = {},
    ): void {
        this.rows.set(id, {
            id,
            userId,
            date: new Date("2026-06-10T06:00:00Z"),
            amount: 100,
            type: "card_payment",
            cardId: null,
            fundedByPartner: false,
            note: null,
            ...over,
        });
    }

    async getForMonth(userId: string): Promise<MovementListItem[]> {
        return [...this.rows.values()]
            .filter((r) => r.userId === userId)
            .map((r) => ({
                id: r.id,
                date: r.date,
                amount: r.amount,
                type: r.type,
                fundedByPartner: r.fundedByPartner,
                card: null,
                note: r.note,
            }));
    }

    async insert(
        userId: string,
        data: MovementWriteData,
    ): Promise<{ id: string }> {
        if (this.failOnWrite) throw new Error("fake: insert failed");
        const row: StoredMovement = { id: `mv_${++this.seq}`, userId, ...data };
        this.rows.set(row.id, row);
        this.inserts.push(row);
        return { id: row.id };
    }

    async deleteForUser(userId: string, id: string): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: delete failed");
        const row = this.rows.get(id);
        if (!row || row.userId !== userId) return 0;
        this.rows.delete(id);
        return 1;
    }
}

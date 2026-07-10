import type {
    ExpenseEditable,
    ExpenseListItem,
    ExpenseRepository,
    ExpenseWriteData,
} from "@/lib/repositories/expense.repository";

type StoredExpense = { id: string; userId: string } & ExpenseWriteData;

const DEFAULT_WRITE: ExpenseWriteData = {
    categoryId: "cat1",
    subcategoryId: null,
    cardId: null,
    date: new Date("2026-05-10T00:00:00Z"),
    description: "seed",
    amount: 100,
    isShared: false,
    yourPercentage: 1,
    actualExpenditure: 100,
    paidBy: "you",
    notes: null,
};

/**
 * In-memory `ExpenseRepository` for unit tests. It satisfies the exact same
 * contract the Prisma adapter does, so an action driven by this fake exercises
 * its real orchestration (validate → authz → FK → persist → map) with zero
 * database. Arrange state with the seed helpers; assert against `inserts`.
 */
export class FakeExpenseRepository implements ExpenseRepository {
    private readonly rows = new Map<string, StoredExpense>();
    private readonly subcategoryToCategory = new Map<string, string>();
    private seq = 0;

    /** Flip on to make the next write throw, simulating a DB failure. */
    failOnWrite = false;

    /** Every row inserted via `insert`, in order — for assertions. */
    readonly inserts: StoredExpense[] = [];

    /** Every `updateForUser` write that matched a row, in order — for assertions. */
    readonly updates: { id: string; userId: string; data: ExpenseWriteData }[] =
        [];

    // --- arrange helpers ---

    setSubcategory(subcategoryId: string, categoryId: string): void {
        this.subcategoryToCategory.set(subcategoryId, categoryId);
    }

    seedExpense(
        id: string,
        userId: string,
        over: Partial<ExpenseWriteData> = {},
    ): void {
        this.rows.set(id, { id, userId, ...DEFAULT_WRITE, ...over });
    }

    // --- ExpenseRepository contract ---

    async getById(userId: string, id: string): Promise<ExpenseEditable | null> {
        const row = this.rows.get(id);
        if (!row || row.userId !== userId) return null;
        return {
            id: row.id,
            date: row.date,
            amount: row.amount,
            categoryId: row.categoryId,
            subcategoryId: row.subcategoryId,
            cardId: row.cardId,
            description: row.description,
            notes: row.notes,
            isShared: row.isShared,
            yourPercentage: row.yourPercentage,
            paidBy: row.paidBy,
        };
    }

    async getForMonth(): Promise<ExpenseListItem[]> {
        // Not exercised by the action tests; the list path has its own
        // integration test against the real Prisma adapter.
        return [];
    }

    async getSubcategoryCategoryId(
        subcategoryId: string,
    ): Promise<string | null> {
        return this.subcategoryToCategory.get(subcategoryId) ?? null;
    }

    async insert(
        userId: string,
        data: ExpenseWriteData,
    ): Promise<{ id: string }> {
        if (this.failOnWrite) throw new Error("fake: insert failed");
        const row: StoredExpense = { id: `exp_${++this.seq}`, userId, ...data };
        this.rows.set(row.id, row);
        this.inserts.push(row);
        return { id: row.id };
    }

    async updateForUser(
        id: string,
        userId: string,
        data: ExpenseWriteData,
    ): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: update failed");
        const existing = this.rows.get(id);
        if (!existing || existing.userId !== userId) return 0;
        this.rows.set(id, { id, userId, ...data });
        this.updates.push({ id, userId, data });
        return 1;
    }
}

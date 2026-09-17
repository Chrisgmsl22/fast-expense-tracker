import type {
    ExpenseEditable,
    ExpenseInsertData,
    ExpenseListItem,
    ExpenseRepository,
    ExpenseWriteData,
} from "@/lib/repositories/expense.repository";

type StoredExpense = {
    id: string;
    userId: string;
    /**
     * Mirrors `ExpenseEditable.cycleClosedAt`, taken as arranged state — so an action's
     * closed-cycle refusal is testable without a database.
     */
    cycleClosedAt: Date | null;
} & ExpenseInsertData;

const DEFAULT_WRITE: ExpenseInsertData = {
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
    fundedFrom: "income",
    notes: null,
    isPartnerPayment: false,
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
    private readonly categoryToSlug = new Map<string, string>();
    private seq = 0;

    /** Flip on to make the next write throw, simulating a DB failure. */
    failOnWrite = false;

    /** Every row inserted via `insert`, in order — for assertions. */
    readonly inserts: StoredExpense[] = [];

    /** Every `updateForUser` write that matched a row, in order — for assertions. */
    readonly updates: { id: string; userId: string; data: ExpenseWriteData }[] =
        [];

    /** Every `deleteForUser` call that matched a row, in order — for assertions. */
    readonly deletes: { id: string; userId: string }[] = [];

    // --- arrange helpers ---

    setSubcategory(subcategoryId: string, categoryId: string): void {
        this.subcategoryToCategory.set(subcategoryId, categoryId);
    }

    /** Give a category a slug, so the Health rule can be exercised. */
    setCategorySlug(categoryId: string, slug: string): void {
        this.categoryToSlug.set(categoryId, slug);
    }

    seedExpense(
        id: string,
        userId: string,
        over: Partial<ExpenseInsertData & { cycleClosedAt: Date | null }> = {},
    ): void {
        this.rows.set(id, {
            id,
            userId,
            cycleClosedAt: null,
            ...DEFAULT_WRITE,
            ...over,
        });
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
            // The STORED share, as the Prisma adapter returns it — never a recomputation.
            actualExpenditure: row.actualExpenditure,
            paidBy: row.paidBy,
            fundedFrom: row.fundedFrom,
            isPartnerPayment: row.isPartnerPayment,
            cycleClosedAt: row.cycleClosedAt,
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

    async getCategorySlug(
        _userId: string,
        categoryId: string,
    ): Promise<string | null> {
        return this.categoryToSlug.get(categoryId) ?? null;
    }

    async insert(
        userId: string,
        data: ExpenseInsertData,
    ): Promise<{ id: string }> {
        if (this.failOnWrite) throw new Error("fake: insert failed");
        const row: StoredExpense = {
            id: `exp_${++this.seq}`,
            userId,
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
        data: ExpenseWriteData,
    ): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: update failed");
        const existing = this.rows.get(id);
        if (!existing || existing.userId !== userId) return 0;
        // `isPartnerPayment` is write-once: the real adapter's update shape has no such
        // field, so the fake must not let an update change it either.
        this.rows.set(id, {
            id,
            userId,
            ...data,
            isPartnerPayment: existing.isPartnerPayment,
            cycleClosedAt: existing.cycleClosedAt,
        });
        this.updates.push({ id, userId, data });
        return 1;
    }

    async deleteForUser(userId: string, id: string): Promise<number> {
        const existing = this.rows.get(id);
        if (!existing || existing.userId !== userId) return 0;
        this.rows.delete(id);
        this.deletes.push({ id, userId });
        return 1;
    }
}

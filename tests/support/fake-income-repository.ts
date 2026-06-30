import type {
    IncomeMonthlySummary,
    IncomeRepository,
    VariableIncomeItem,
    VariableIncomeWriteData,
} from "@/lib/repositories/income.repository";

type StoredVariable = { id: string; userId: string } & VariableIncomeWriteData;

/**
 * In-memory `IncomeRepository` for unit tests. Satisfies the exact contract the
 * Prisma adapter does, so an action driven by this fake exercises its real
 * orchestration (validate → authz → persist → map) with zero database. Mirrors
 * `FakeExpenseRepository`.
 */
export class FakeIncomeRepository implements IncomeRepository {
    private readonly variableRows = new Map<string, StoredVariable>();
    private readonly fixedByUser = new Map<string, number>();
    private seq = 0;

    /** Flip on to make the next write/delete throw, simulating a DB failure. */
    failOnWrite = false;

    /** Every variable row inserted via `insertVariable`, in order. */
    readonly inserts: StoredVariable[] = [];
    /** Every `(userId, amount)` passed to `setFixed`, in order. */
    readonly fixedWrites: Array<{ userId: string; amount: number }> = [];

    // --- arrange helpers ---

    seedVariable(
        id: string,
        userId: string,
        over: Partial<VariableIncomeWriteData> = {},
    ): void {
        this.variableRows.set(id, {
            id,
            userId,
            date: new Date("2026-06-10T06:00:00Z"),
            source: "seed",
            amount: 100,
            ...over,
        });
    }

    seedFixed(userId: string, amount: number): void {
        this.fixedByUser.set(userId, amount);
    }

    // --- IncomeRepository contract ---

    async getMonthlySummary(userId: string): Promise<IncomeMonthlySummary> {
        const fixed = this.fixedByUser.get(userId) ?? 0;
        const variable = [...this.variableRows.values()]
            .filter((r) => r.userId === userId)
            .reduce((sum, r) => sum + r.amount, 0);
        return { fixed, variable, total: fixed + variable };
    }

    async getVariableForMonth(userId: string): Promise<VariableIncomeItem[]> {
        return [...this.variableRows.values()]
            .filter((r) => r.userId === userId)
            .map((r) => ({
                id: r.id,
                date: r.date,
                source: r.source,
                amount: r.amount,
            }));
    }

    async insertVariable(
        userId: string,
        data: VariableIncomeWriteData,
    ): Promise<{ id: string }> {
        if (this.failOnWrite) throw new Error("fake: insert failed");
        const row: StoredVariable = {
            id: `inc_${++this.seq}`,
            userId,
            ...data,
        };
        this.variableRows.set(row.id, row);
        this.inserts.push(row);
        return { id: row.id };
    }

    async deleteVariableForUser(id: string, userId: string): Promise<number> {
        if (this.failOnWrite) throw new Error("fake: delete failed");
        const row = this.variableRows.get(id);
        if (!row || row.userId !== userId) return 0;
        this.variableRows.delete(id);
        return 1;
    }

    async setFixed(userId: string, amount: number): Promise<void> {
        if (this.failOnWrite) throw new Error("fake: setFixed failed");
        this.fixedByUser.set(userId, amount);
        this.fixedWrites.push({ userId, amount });
    }
}

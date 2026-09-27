import type {
    IncomeMonthlySummary,
    IncomeRepository,
    VariableIncomeItem,
    VariableIncomeWriteData,
} from "@/lib/repositories/income.repository";
import { resolveEffective } from "@/lib/domain/effective-month";
import { carryForwardRow } from "@/lib/domain/fixed-income";

type StoredVariable = { id: string; userId: string } & VariableIncomeWriteData;
type StoredFixed = {
    userId: string;
    effectiveMonth: string | null;
    amount: number;
};

/**
 * In-memory `IncomeRepository` for unit tests. Satisfies the exact contract the
 * Prisma adapter does, so an action driven by this fake exercises its real
 * orchestration (validate → authz → persist → map) with zero database. Mirrors
 * `FakeExpenseRepository`.
 */
export class FakeIncomeRepository implements IncomeRepository {
    private readonly variableRows = new Map<string, StoredVariable>();
    private readonly fixedRows: StoredFixed[] = [];
    private seq = 0;

    /** Flip on to make the next write/delete throw, simulating a DB failure. */
    failOnWrite = false;

    /** Every variable row inserted via `insertVariable`, in order. */
    readonly inserts: StoredVariable[] = [];
    /** Every call to `setFixed`, in order. */
    readonly fixedWrites: Array<{
        userId: string;
        effectiveMonth: string;
        amount: number;
    }> = [];
    /** Every call to `setFixedForMonthOnly`, in order. */
    readonly monthOnlyWrites: Array<{
        userId: string;
        month: string;
        amount: number;
    }> = [];

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

    /** `effectiveMonth` defaults to `null`: the undated row that applies to every month. */
    seedFixed(
        userId: string,
        amount: number,
        effectiveMonth: string | null = null,
    ): void {
        this.upsertFixed(userId, effectiveMonth, amount);
    }

    private upsertFixed(
        userId: string,
        effectiveMonth: string | null,
        amount: number,
    ): void {
        const row = this.fixedRows.find(
            (r) => r.userId === userId && r.effectiveMonth === effectiveMonth,
        );
        if (row) row.amount = amount;
        else this.fixedRows.push({ userId, effectiveMonth, amount });
    }

    // --- IncomeRepository contract ---

    async getMonthlySummary(
        userId: string,
        month: string,
    ): Promise<IncomeMonthlySummary> {
        const own = this.fixedRows.filter((r) => r.userId === userId);
        const fixed = resolveEffective(own, month)?.amount ?? 0;
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

    async setFixed(
        userId: string,
        effectiveMonth: string,
        amount: number,
    ): Promise<void> {
        if (this.failOnWrite) throw new Error("fake: setFixed failed");
        this.upsertFixed(userId, effectiveMonth, amount);
        this.fixedWrites.push({ userId, effectiveMonth, amount });
    }

    async setFixedForMonthOnly(
        userId: string,
        month: string,
        amount: number,
    ): Promise<void> {
        if (this.failOnWrite) throw new Error("fake: setFixed failed");
        const own = this.fixedRows.filter((r) => r.userId === userId);
        const carry = carryForwardRow(own, month);
        this.upsertFixed(userId, month, amount);
        if (carry) this.upsertFixed(userId, carry.effectiveMonth, carry.amount);
        this.monthOnlyWrites.push({ userId, month, amount });
    }
}

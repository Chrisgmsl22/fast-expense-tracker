import type {
    SettlementExpenseRow,
    SettlementMovementRow,
    SettlementRepository,
    SettlementWindowRows,
} from "@/lib/repositories/settlement.repository";

/**
 * In-memory `SettlementRepository` for unit tests. Holds expense + movement rows
 * and returns those inside the requested UTC window, so `getSettlement` runs its
 * real windowing + netting with zero database.
 */
export class FakeSettlementRepository implements SettlementRepository {
    private expenses: SettlementExpenseRow[] = [];
    private movements: SettlementMovementRow[] = [];

    setExpenses(rows: SettlementExpenseRow[]): void {
        this.expenses = rows;
    }

    setMovements(rows: SettlementMovementRow[]): void {
        this.movements = rows;
    }

    async getForWindow(
        _userId: string,
        start: Date,
        end: Date,
    ): Promise<SettlementWindowRows> {
        const inWindow = <T extends { date: Date }>(rows: T[]): T[] =>
            rows
                .filter((r) => r.date >= start && r.date < end)
                .sort((a, b) => b.date.getTime() - a.date.getTime());
        return {
            expenses: inWindow(this.expenses),
            movements: inWindow(this.movements),
        };
    }
}

import { canCloseCycle } from "@/lib/domain/settlement";
import type {
    SettlementCycleMarker,
    SettlementExpenseRow,
    SettlementMovementRow,
    SettlementRepository,
    SettlementWindowRows,
} from "@/lib/repositories/settlement.repository";

/** Entry time, mirroring the service. */
const entryTime = (row: { createdAt: Date }): number => row.createdAt.getTime();

/**
 * In-memory `SettlementRepository` for unit tests. Holds expense + movement rows
 * and answers both windows the service asks for — the calendar month (by date)
 * and a cycle (by entry time) — so `getSettlement` runs its real membership +
 * netting rules with zero database.
 */
export class FakeSettlementRepository implements SettlementRepository {
    private expenses: SettlementExpenseRow[] = [];
    private movements: SettlementMovementRow[] = [];
    private markers: SettlementCycleMarker[] = [];

    setExpenses(rows: SettlementExpenseRow[]): void {
        this.expenses = rows;
    }

    setMovements(rows: SettlementMovementRow[]): void {
        this.movements = rows;
    }

    /** Pre-existing cycle closes, oldest first. */
    setMarkers(markers: SettlementCycleMarker[]): void {
        this.markers = markers;
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

    async getForCreatedRange(
        _userId: string,
        after: Date | null,
        through: Date | null,
    ): Promise<SettlementWindowRows> {
        const inRange = <T extends { date: Date; createdAt: Date }>(
            rows: T[],
        ): T[] =>
            rows
                .filter((r) => {
                    const t = entryTime(r);
                    if (after && t <= after.getTime()) return false;
                    if (through && t > through.getTime()) return false;
                    return true;
                })
                .sort((a, b) => b.date.getTime() - a.date.getTime());
        return {
            expenses: inRange(this.expenses),
            movements: inRange(this.movements),
        };
    }

    // The fake holds one user's rows, so it ignores the id the port passes.
    async getCycleMarkers(): Promise<SettlementCycleMarker[]> {
        return [...this.markers].sort(
            (a, b) => a.closedAt.getTime() - b.closedAt.getTime(),
        );
    }

    async markCycleClose(
        _userId: string,
        movementId: string,
        closedAt: Date,
    ): Promise<number> {
        const movement = this.movements.find((m) => m.id === movementId);
        // Same preconditions the Prisma where-clause carries: the row exists, is
        // a transfer, and isn't already a marker. Anything else affects 0 rows.
        if (!movement || !canCloseCycle(movement.type)) return 0;
        if (this.markers.some((m) => m.id === movementId)) return 0;
        this.markers.push({
            id: movement.id,
            date: movement.date,
            closedAt,
            amount: movement.amount,
        });
        return 1;
    }
}

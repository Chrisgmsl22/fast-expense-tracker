import { canCloseCycle, type SettlementRowRef } from "@/lib/domain/settlement";
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
        marker: SettlementRowRef,
        closedAt: Date,
    ): Promise<number> {
        // Same preconditions the Prisma where-clauses carry: the row exists, may carry
        // the marker, and isn't already one. Anything else affects 0 rows.
        if (
            this.markers.some(
                (m) => m.id === marker.id && m.kind === marker.kind,
            )
        ) {
            return 0;
        }

        if (marker.kind === "expense") {
            const expense = this.expenses.find((e) => e.id === marker.id);
            if (!expense?.isPartnerPayment) return 0;
            this.markers.push({
                id: expense.id,
                kind: "expense",
                date: expense.date,
                closedAt,
                amount: expense.actualExpenditure,
            });
            return 1;
        }

        const movement = this.movements.find((m) => m.id === marker.id);
        if (!movement || !canCloseCycle(movement.type)) return 0;
        this.markers.push({
            id: movement.id,
            kind: "movement",
            date: movement.date,
            closedAt,
            amount: movement.amount,
        });
        return 1;
    }
}

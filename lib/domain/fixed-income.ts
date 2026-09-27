import { shiftMonth } from "@/lib/dates";
import { resolveEffective } from "@/lib/domain/effective-month";

/** One FIXED income row: its amount applies from `effectiveMonth` onward. */
export type FixedIncomeRow = { effectiveMonth: string | null; amount: number };

// An edit of `month` alone needs a row for the next month that holds its old
// amount, else the edit carries forward. `null` when the next month has its own row.
export function carryForwardRow(
    rows: readonly FixedIncomeRow[],
    month: string,
): { effectiveMonth: string; amount: number } | null {
    const next = shiftMonth(month, 1);
    if (rows.some((r) => r.effectiveMonth === next)) return null;
    return {
        effectiveMonth: next,
        amount: resolveEffective(rows, next)?.amount ?? 0,
    };
}

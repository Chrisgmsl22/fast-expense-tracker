import {
    getCurrentMonthCdmx,
    getMonthRangeUtc,
    getTodayCdmx,
    shiftMonth,
} from "@/lib/dates";
import type { FinancialExportInput } from "@/lib/schemas/financial-export";

export interface ExportPeriod {
    label: string;
    start: Date;
    end: Date;
    cutoff: string;
    months: string[];
    partial: boolean;
}

export function resolveExportPeriod(
    input: FinancialExportInput,
    now = new Date(),
): ExportPeriod | null {
    const currentMonth = getCurrentMonthCdmx(now);
    const first = input.type === "year" ? input.period + "-01" : input.period;
    if (first > currentMonth) return null;
    const last =
        input.type === "year"
            ? input.period === currentMonth.slice(0, 4)
                ? currentMonth
                : input.period + "-12"
            : first;
    const months: string[] = [];
    for (let month = first; month <= last; month = shiftMonth(month, 1))
        months.push(month);
    const partial = last === currentMonth;
    const cutoff = partial
        ? getTodayCdmx(now)
        : new Date(getMonthRangeUtc(last).end.getTime() - 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10);
    const end = partial
        ? new Date(
              new Date(cutoff + "T06:00:00Z").getTime() + 24 * 60 * 60 * 1000,
          )
        : getMonthRangeUtc(last).end;
    return {
        label: input.period,
        start: getMonthRangeUtc(first).start,
        end,
        cutoff,
        months,
        partial,
    };
}

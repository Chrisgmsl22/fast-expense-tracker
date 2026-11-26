import { getTodayCdmx } from "@/lib/dates";
import { resolveEffective } from "@/lib/domain/effective-month";
import type { FinancialExportData } from "@/lib/repositories/financial-export.repository";
import type { ExportPeriod } from "./period";

/** Summary placeholders and a cleared fixed income do not make a period exportable. */
export function hasFinancialExportData(
    data: FinancialExportData,
    period: ExportPeriod,
): boolean {
    return (
        data.expenses.length > 0 ||
        data.movements.length > 0 ||
        data.variableIncome.some(
            (row) =>
                row.date !== null &&
                period.months.includes(getTodayCdmx(row.date).slice(0, 7)),
        ) ||
        period.months.some(
            (month) =>
                (resolveEffective(data.fixedIncome, month)?.amount ?? 0) > 0,
        )
    );
}

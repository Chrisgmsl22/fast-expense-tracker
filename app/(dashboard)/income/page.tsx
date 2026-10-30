import { getLocale } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import { getCurrentMonthCdmx } from "@/lib/dates";
import { formatMonthName } from "@/lib/format";
import { getScopedMonth } from "@/lib/month-scope.server";
import { incomeRepository } from "@/lib/repositories";
import { IncomeScreen } from "@/components/income/IncomeScreen";
import { MonthPicker } from "@/components/expense/MonthPicker";

// Per-request, DB-backed data — never prerender at build (no DB in preview builds, ADR-0004).
export const dynamic = "force-dynamic";

export default async function IncomePage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    const { month: monthParam } = await searchParams;
    const month = await getScopedMonth(monthParam);
    const currentMonth = getCurrentMonthCdmx();

    const userId = await getSessionUserId();
    // The proxy route gate guarantees a session; this satisfies the nullable
    // type and fails safe if it's ever reached without one.
    if (!userId) {
        return null;
    }

    const [summary, variable] = await Promise.all([
        incomeRepository.getMonthlySummary(userId, month),
        incomeRepository.getVariableForMonth(userId, month),
    ]);

    // The short month label the design uses on the stat cards.
    const monthLabel = formatMonthName(month, await getLocale());

    return (
        <main className="p-8">
            <div className="mb-6">
                <MonthPicker
                    month={month}
                    remember
                    currentMonth={currentMonth}
                />
            </div>
            <IncomeScreen
                fixed={summary.fixed}
                variableTotal={summary.variable}
                total={summary.total}
                month={month}
                currentMonth={currentMonth}
                monthLabel={monthLabel}
                variable={variable}
            />
        </main>
    );
}

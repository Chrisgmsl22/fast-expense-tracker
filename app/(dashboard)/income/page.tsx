import { auth } from "@/auth";
import { getCurrentMonthCdmx, isValidMonth } from "@/lib/dates";
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
    const month =
        monthParam && isValidMonth(monthParam)
            ? monthParam
            : getCurrentMonthCdmx();

    const session = await auth();
    const userId = session?.user?.id;
    // The proxy route gate guarantees a session; this satisfies the nullable
    // type and fails safe if it's ever reached without one.
    if (!userId) {
        return null;
    }

    const [summary, variable] = await Promise.all([
        incomeRepository.getMonthlySummary(userId, month),
        incomeRepository.getVariableForMonth(userId, month),
    ]);

    // "2026-06" → "June" — the short month label the design uses on the stat
    // cards. UTC: the value is a calendar month, not a timestamp to shift.
    const monthLabel = new Intl.DateTimeFormat("en-US", {
        month: "long",
        timeZone: "UTC",
    }).format(new Date(`${month}-01T12:00:00Z`));

    return (
        <main className="p-8">
            <div className="mb-6">
                <MonthPicker month={month} />
            </div>
            <IncomeScreen
                fixed={summary.fixed}
                variableTotal={summary.variable}
                total={summary.total}
                month={month}
                monthLabel={monthLabel}
                variable={variable}
            />
        </main>
    );
}

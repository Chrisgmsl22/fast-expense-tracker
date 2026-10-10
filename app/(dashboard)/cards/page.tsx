import { auth } from "@/auth";
import { getCurrentMonthCdmx } from "@/lib/dates";
import { summarizeCardBalances } from "@/lib/domain/card-balance";
import { resolvePartnerName } from "@/lib/domain/settings";
import { formatMonthName } from "@/lib/format";
import { getScopedMonth } from "@/lib/month-scope.server";
import {
    cardRepository,
    categoryRepository,
    settingsRepository,
} from "@/lib/repositories";
import { AddExpenseButton } from "@/components/expense/AddExpenseButton";
import { CardBalancesScreen } from "@/components/cards/CardBalancesScreen";

// Per-request, DB-backed data — never prerender at build (no DB in preview builds, ADR-0004).
export const dynamic = "force-dynamic";

export default async function CardBalancesPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    const { month: monthParam } = await searchParams;
    const month = await getScopedMonth(monthParam);
    const currentMonth = getCurrentMonthCdmx();

    const session = await auth();
    const userId = session?.user?.id;
    // The proxy route gate guarantees a session; this satisfies the nullable
    // type and fails safe if it's ever reached without one.
    if (!userId) {
        return null;
    }

    const [rows, categories, subcategories, pickerCards, settings] =
        await Promise.all([
            cardRepository.listBalances(userId, month),
            categoryRepository.listForPicker(userId),
            categoryRepository.listSubcategoriesForPicker(userId),
            cardRepository.listActive(userId),
            settingsRepository.getSettings(userId),
        ]);
    const summary = summarizeCardBalances(rows);

    return (
        <main className="flex flex-col gap-3.5 p-4 sm:p-6 lg:p-8">
            <div className="flex items-center gap-3">
                <div>
                    <h1 className="text-[22px] font-bold tracking-tight">
                        Card balances
                    </h1>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Based on logged expenses, not your bank statement · MXN
                    </p>
                </div>
                <div className="ml-auto">
                    <AddExpenseButton
                        categories={categories}
                        subcategories={subcategories}
                        cards={pickerCards}
                        defaultSharePercentage={settings.defaultSharePercentage}
                        partnerName={resolvePartnerName(settings.partnerName)}
                        sharesExpenses={settings.sharesExpenses}
                    />
                </div>
            </div>
            <CardBalancesScreen
                summary={summary}
                month={month}
                monthName={formatMonthName(month)}
                currentMonth={currentMonth}
            />
        </main>
    );
}

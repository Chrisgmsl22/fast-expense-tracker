import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentMonthCdmx, isValidMonth } from "@/lib/dates";
import { resolvePartnerName } from "@/lib/domain/settings";
import {
    expenseRepository,
    movementRepository,
    settingsRepository,
} from "@/lib/repositories";
import { getDashboardSummary } from "@/lib/services/dashboard/dashboard.service";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { BucketsHero } from "@/components/dashboard/BucketsHero";
import { CategoriesGrid } from "@/components/dashboard/CategoriesGrid";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { MonthFeed } from "@/components/dashboard/MonthFeed";
import { SpendByCard } from "@/components/dashboard/SpendByCard";
import { SpendRadar } from "@/components/dashboard/SpendRadar";
import { StatStrip } from "@/components/dashboard/StatStrip";

// Per-request, DB-backed data — never prerender at build (no DB in preview builds, ADR-0004).
export const dynamic = "force-dynamic";

export default async function DashboardPage({
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

    const [
        summary,
        settlement,
        expenses,
        movements,
        categories,
        subcategories,
        cards,
        settings,
    ] = await Promise.all([
        getDashboardSummary(userId, month),
        getSettlement(userId),
        expenseRepository.getForMonth(userId, month),
        movementRepository.getForMonth(userId, month),
        db.category.findMany({
            orderBy: { name: "asc" },
            select: { id: true, slug: true, name: true, color: true },
        }),
        db.subcategory.findMany({
            select: { id: true, name: true, categoryId: true },
        }),
        // Archived cards drop out of the picker (spec 0006 §6); history reads
        // stay unfiltered so old expenses still resolve their card.
        db.card.findMany({
            where: { userId, archivedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, color: true },
        }),
        settingsRepository.getSettings(userId),
    ]);

    const sharePercentage = settings.defaultSharePercentage;
    const partnerName = resolvePartnerName(settings.partnerName);
    const { sharesExpenses } = settings;

    // "2026-06" → "June 2026" (UTC: a calendar month, not a timestamp to shift).
    const monthLabel = new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${month}-01T12:00:00Z`));

    return (
        <main className="p-4 sm:p-6 lg:p-8">
            <DashboardTopbar
                month={month}
                monthLabel={monthLabel}
                incomeTotal={summary.income.total}
                sharePercentage={sharePercentage}
                categories={categories}
                subcategories={subcategories}
                cards={cards}
                partnerName={partnerName}
                sharesExpenses={sharesExpenses}
            />
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_24rem]">
                {/* Main column */}
                <div className="space-y-4">
                    <BucketsHero buckets={summary.buckets} />
                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                            <SpendRadar categories={summary.topCategories} />
                        </div>
                        <SpendByCard cards={summary.cards} />
                    </div>
                    <StatStrip
                        income={summary.income.total}
                        spent={summary.consumptionSpent}
                        net={summary.net}
                        dailyAvg={summary.dailyAvg}
                        daysLeft={summary.daysLeft}
                    />
                    <CategoriesGrid
                        categories={summary.categoryBudgets}
                        month={month}
                    />
                </div>

                {/* Right rail — month feed */}
                <aside>
                    <MonthFeed
                        expenses={expenses}
                        movements={movements}
                        monthLabel={monthLabel}
                        settlement={settlement.balance}
                        partnerName={partnerName}
                        sharesExpenses={sharesExpenses}
                    />
                </aside>
            </div>
        </main>
    );
}

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentMonthCdmx, isValidMonth } from "@/lib/dates";
import { expenseRepository } from "@/lib/repositories";
import { getDashboardSummary } from "@/lib/services/dashboard/dashboard.service";
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

    const [summary, expenses, categories, subcategories, cards, settings] =
        await Promise.all([
            getDashboardSummary(userId, month),
            expenseRepository.getForMonth(userId, month),
            db.category.findMany({
                orderBy: { name: "asc" },
                select: { id: true, name: true, color: true },
            }),
            db.subcategory.findMany({
                select: { id: true, name: true, categoryId: true },
            }),
            db.card.findMany({
                where: { userId },
                orderBy: { name: "asc" },
                select: { id: true, name: true, color: true },
            }),
            db.settings.findUnique({
                where: { userId },
                select: { defaultSharePercentage: true },
            }),
        ]);

    const sharePercentage = settings?.defaultSharePercentage ?? 0.68;

    // "2026-06" → "June 2026" (UTC: a calendar month, not a timestamp to shift).
    const monthLabel = new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${month}-01T12:00:00Z`));

    return (
        <main className="p-6 lg:p-8">
            <DashboardTopbar
                month={month}
                monthLabel={monthLabel}
                incomeTotal={summary.income.total}
                sharePercentage={sharePercentage}
                categories={categories}
                subcategories={subcategories}
                cards={cards}
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
                        spent={summary.spentTotal}
                        net={summary.net}
                        dailyAvg={summary.dailyAvg}
                        daysLeft={summary.daysLeft}
                    />
                    <CategoriesGrid categories={summary.categoryBudgets} />
                </div>

                {/* Right rail — month feed */}
                <aside>
                    <MonthFeed expenses={expenses} monthLabel={monthLabel} />
                </aside>
            </div>
        </main>
    );
}

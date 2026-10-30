import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import { getScopedMonth } from "@/lib/month-scope.server";
import { formatMonthLabel } from "@/lib/format";
import { resolvePartnerName } from "@/lib/domain/settings";
import { settingsRepository } from "@/lib/repositories";
import { getCategoryDetail } from "@/lib/services/category/category.service";
import { CategoryDetailHeader } from "@/components/category/CategoryDetailHeader";
import { CategoryExpenses } from "@/components/category/CategoryExpenses";
import { CategoryStats } from "@/components/category/CategoryStats";
import { SubcategoryBreakdown } from "@/components/category/SubcategoryBreakdown";

// Per-request, DB-backed data — never prerender at build (no DB in preview builds, ADR-0004).
export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ month?: string }>;
}) {
    const { slug } = await params;
    const { month: monthParam } = await searchParams;
    const month = await getScopedMonth(monthParam);

    const userId = await getSessionUserId();
    // The proxy route gate guarantees a session; this satisfies the nullable
    // type and fails safe if it's ever reached without one.
    if (!userId) {
        return null;
    }

    const [detail, settings] = await Promise.all([
        getCategoryDetail(userId, slug, month),
        settingsRepository.getSettings(userId),
    ]);
    if (!detail) {
        notFound();
    }

    const monthLabel = formatMonthLabel(month, await getLocale());

    return (
        <main className="mx-auto max-w-3xl p-6 lg:p-8">
            <CategoryDetailHeader
                name={detail.meta.name}
                color={detail.meta.color}
                bucket={detail.bucket}
                hasLimit={detail.hasLimit}
                remaining={detail.remaining}
                over={detail.over}
                backHref={`/dashboard?month=${month}`}
            />
            <div className="mt-6 space-y-8">
                <CategoryStats
                    slug={slug}
                    month={month}
                    monthLabel={monthLabel}
                    categoryName={detail.meta.name}
                    color={detail.meta.color}
                    spent={detail.spent}
                    spentNotFromIncome={detail.spentNotFromIncome}
                    limit={detail.limit}
                    defaultBudget={detail.defaultBudget}
                    thisMonthOverride={detail.thisMonthOverride}
                    hasLimit={detail.hasLimit}
                    remaining={detail.remaining}
                    over={detail.over}
                    pctOfLimit={detail.pctOfLimit}
                    daysLeft={detail.daysLeft}
                    expenseCount={detail.expenseCount}
                    subcatWithSpend={detail.subcatWithSpend}
                />
                <SubcategoryBreakdown
                    bars={detail.breakdown}
                    color={detail.meta.color}
                    spentNotFromIncome={detail.spentNotFromIncome}
                />
                <CategoryExpenses
                    expenses={detail.expenses}
                    color={detail.meta.color}
                    partnerName={resolvePartnerName(settings.partnerName)}
                />
            </div>
        </main>
    );
}

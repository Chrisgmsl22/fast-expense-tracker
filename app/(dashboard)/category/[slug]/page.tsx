import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { getCurrentMonthCdmx, isValidMonth } from "@/lib/dates";
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

    const detail = await getCategoryDetail(userId, slug, month);
    if (!detail) {
        notFound();
    }

    // "2026-06" → "June 2026" (UTC: a calendar month, not a timestamp to shift).
    const monthLabel = new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${month}-01T12:00:00Z`));

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
                />
                <CategoryExpenses
                    expenses={detail.expenses}
                    color={detail.meta.color}
                />
            </div>
        </main>
    );
}

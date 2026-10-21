import {
    getCurrentMonthCdmx,
    getMonthProgress,
    getMonthRangeUtc,
} from "@/lib/dates";
import { isBalanceSettled, type CoupleBalance } from "@/lib/domain/settlement";
import type { BucketKey } from "@/lib/domain/dashboard";
import type { DashboardSummary } from "@/lib/services/dashboard/dashboard.service";

type SidebarSummary = Pick<
    DashboardSummary,
    "consumptionSpent" | "savingsSpent" | "net" | "buckets" | "categoryBudgets"
>;

type AlertBase = { key: string; amount: number; href: string };

export type SidebarAlert =
    | (AlertBase & { kind: "bucket"; bucket: Exclude<BucketKey, "savings"> })
    | (AlertBase & { kind: "category"; name: string });

export function getSidebarDate(now: Date) {
    const month = getCurrentMonthCdmx(now);
    const { daysElapsed: day, daysInMonth } = getMonthProgress(month, now);
    return {
        month,
        day,
        daysInMonth,
        dayKey: `${month}-${String(day).padStart(2, "0")}`,
        nextDayAt: getMonthRangeUtc(month).start.getTime() + day * 86400000,
    };
}

export function buildSidebarModel(
    summary: SidebarSummary,
    balance: CoupleBalance,
    sharesExpenses: boolean,
    partnerName: string,
    now: Date,
) {
    const date = getSidebarDate(now);
    const alerts: SidebarAlert[] = [];
    for (const bucket of summary.buckets) {
        if (bucket.key === "savings" || bucket.spent <= bucket.target) continue;
        alerts.push({
            key: bucket.key,
            kind: "bucket",
            bucket: bucket.key,
            amount: bucket.spent - bucket.target,
            href: `/dashboard?month=${date.month}`,
        });
    }
    for (const category of summary.categoryBudgets) {
        if (
            !category.monthlyBudget ||
            category.monthlyBudget <= 0 ||
            category.spent <= category.monthlyBudget
        )
            continue;
        alerts.push({
            key: category.slug,
            kind: "category",
            name: category.name,
            amount: category.spent - category.monthlyBudget,
            href: `/category/${encodeURIComponent(category.slug)}?month=${date.month}`,
        });
    }
    return {
        period: {
            ...date,
            progress: (date.day / date.daysInMonth) * 100,
        },
        totals: {
            spent: summary.consumptionSpent,
            saved: summary.savingsSpent,
            net: summary.net,
        },
        alerts,
        settlement:
            sharesExpenses || !isBalanceSettled(balance)
                ? {
                      direction: balance.direction,
                      amount: balance.amount,
                      partnerName,
                  }
                : null,
    };
}
export type SidebarModel = ReturnType<typeof buildSidebarModel>;

export function isSidebarLinkActive(pathname: string, href: string): boolean {
    const target = href.split("?")[0];
    if (pathname.startsWith("/category/")) {
        return pathname === "/category/savings"
            ? target === "/category/savings"
            : target === "/expenses";
    }
    return pathname === target || pathname.startsWith(`${target}/`);
}

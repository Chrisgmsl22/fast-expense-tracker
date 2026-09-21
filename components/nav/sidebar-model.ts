import {
    getCurrentMonthCdmx,
    getMonthProgress,
    getMonthRangeUtc,
} from "@/lib/dates";
import { formatMonthLabel } from "@/lib/format";
import { isBalanceSettled, type CoupleBalance } from "@/lib/domain/settlement";
import type { DashboardSummary } from "@/lib/services/dashboard/dashboard.service";

type SidebarSummary = Pick<
    DashboardSummary,
    "consumptionSpent" | "savingsSpent" | "net" | "buckets" | "categoryBudgets"
>;

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
    const alerts: {
        key: string;
        kind: "bucket" | "category";
        label: string;
        amount: number;
        href: string;
    }[] = [];
    for (const bucket of summary.buckets) {
        if (bucket.key === "savings" || bucket.spent <= bucket.target) continue;
        alerts.push({
            key: bucket.key,
            kind: "bucket",
            label: bucket.key === "essentials" ? "Essentials" : "Discretionary",
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
            label: category.name,
            amount: category.spent - category.monthlyBudget,
            href: `/category/${encodeURIComponent(category.slug)}?month=${date.month}`,
        });
    }
    return {
        period: {
            ...date,
            monthLabel: formatMonthLabel(date.month),
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
                      label:
                          balance.direction === "she_owes"
                              ? `${partnerName} owes you`
                              : balance.direction === "you_owe"
                                ? `You owe ${partnerName}`
                                : "Settled",
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

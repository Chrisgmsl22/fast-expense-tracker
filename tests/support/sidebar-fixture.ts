import type { DashboardSummary } from "@/lib/services/dashboard/dashboard.service";
import type { CoupleBalance } from "@/lib/domain/settlement";

export const sidebarSummary: Pick<
    DashboardSummary,
    "consumptionSpent" | "savingsSpent" | "net" | "buckets" | "categoryBudgets"
> = {
    consumptionSpent: 1300,
    savingsSpent: 400,
    net: 2300,
    buckets: [
        { key: "essentials", spent: 1100, target: 1000 },
        { key: "discretionary", spent: 200, target: 500 },
        { key: "savings", spent: 400, target: 300 },
    ],
    categoryBudgets: [
        {
            slug: "food",
            name: "Food",
            color: "#123456",
            monthlyBudget: 300,
            spent: 450,
            subcatTotal: 1,
            subcatWithSpend: 1,
        },
    ],
};
export const sidebarBalance: CoupleBalance = {
    balance: 75,
    amount: 75,
    direction: "she_owes",
    breakdown: [],
};
export const sidebarNow = new Date("2026-09-19T05:59:00Z");

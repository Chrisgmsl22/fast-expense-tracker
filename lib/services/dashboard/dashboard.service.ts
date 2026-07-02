import { getMonthProgress } from "@/lib/dates";
import {
    computeBuckets,
    savingsSpend,
    topCategories,
    type Bucket,
    type TopCategory,
} from "@/lib/domain/dashboard";
import { dashboardRepository, incomeRepository } from "@/lib/repositories";
import type {
    CardSpend,
    CategoryBudgetItem,
    DashboardRepository,
} from "@/lib/repositories/dashboard.repository";
import type {
    IncomeMonthlySummary,
    IncomeRepository,
} from "@/lib/repositories/income.repository";

/** Everything the dashboard renders (buckets + stat strip + charts). */
export type DashboardSummary = {
    income: IncomeMonthlySummary;
    buckets: Bucket[];
    /**
     * Consumption my-share spend — every category EXCEPT Savings. Savings is an
     * allocation (a transfer), not a spend, so it's excluded from "Spent".
     */
    consumptionSpent: number;
    /** My-share moved to Savings this month (its own allocation, not "spent"). */
    savingsSpent: number;
    /**
     * income.total − (consumptionSpent + savingsSpent). Savings still left the
     * account, so it reduces what's remaining even though it isn't "spent".
     */
    net: number;
    /** consumptionSpent ÷ days elapsed this month (0 before any day elapses). */
    dailyAvg: number;
    /** Calendar days remaining in the viewed month. */
    daysLeft: number;
    /** Per-card my-share spend, high→low (spend-by-card chart). */
    cards: CardSpend[];
    /** Top ~5 categories by my-share spend (radar). */
    topCategories: TopCategory[];
    /** Per-category budget status, high→low (categories grid). */
    categoryBudgets: CategoryBudgetItem[];
};

/** Injectable seams so the assembly is unit-testable without a DB or the clock. */
export type DashboardDeps = {
    dashboardRepo: DashboardRepository;
    incomeRepo: IncomeRepository;
    now: Date;
};

/**
 * Assemble the dashboard summary for `month`: income +
 * per-category spend → 50/25/25 buckets + the stat strip (spent / net / daily
 * average / days left). Pure math lives in `lib/domain/dashboard`; this only
 * orchestrates the two repositories and the month-progress clock.
 *
 * "Spent" is consumption only (all categories minus Savings). Savings is a
 * transfer, not a spend — but it still leaves the account, so `net` subtracts
 * both consumption and savings (total outflow), keeping "remaining" honest.
 */
export async function getDashboardSummary(
    userId: string,
    month: string,
    deps: Partial<DashboardDeps> = {},
): Promise<DashboardSummary> {
    const dashboardRepo = deps.dashboardRepo ?? dashboardRepository;
    const incomeRepo = deps.incomeRepo ?? incomeRepository;
    const now = deps.now ?? new Date();

    const [income, categorySpends, cards, categoryBudgets] = await Promise.all([
        incomeRepo.getMonthlySummary(userId, month),
        dashboardRepo.getCategorySpends(userId, month),
        dashboardRepo.getCardSpends(userId, month),
        dashboardRepo.getCategoryBreakdown(userId, month),
    ]);

    const buckets = computeBuckets(categorySpends, income.total);
    const totalOutflow = categorySpends.reduce((sum, c) => sum + c.spent, 0);
    const savings = savingsSpend(categorySpends);
    const consumptionSpent = totalOutflow - savings;
    const { daysElapsed, daysLeft } = getMonthProgress(month, now);
    const dailyAvg = daysElapsed > 0 ? consumptionSpent / daysElapsed : 0;

    return {
        income,
        buckets,
        consumptionSpent,
        savingsSpent: savings,
        net: income.total - totalOutflow,
        dailyAvg,
        daysLeft,
        cards,
        topCategories: topCategories(categorySpends),
        categoryBudgets,
    };
}

import { getMonthProgress } from "@/lib/dates";
import {
    computeBuckets,
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
    /** Total my-share spend (`actualExpenditure`) across all categories. */
    spentTotal: number;
    /** income.total − spentTotal (can be negative when overspending). */
    net: number;
    /** spentTotal ÷ days elapsed this month (0 before any day elapses). */
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
 * `spentTotal` is every category's my-share spend (including Unassigned), so it
 * reflects real cash out even though Unassigned has no 50/25/25 bucket.
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
    const spentTotal = categorySpends.reduce((sum, c) => sum + c.spent, 0);
    const { daysElapsed, daysLeft } = getMonthProgress(month, now);
    const dailyAvg = daysElapsed > 0 ? spentTotal / daysElapsed : 0;

    return {
        income,
        buckets,
        spentTotal,
        net: income.total - spentTotal,
        dailyAvg,
        daysLeft,
        cards,
        topCategories: topCategories(categorySpends),
        categoryBudgets,
    };
}

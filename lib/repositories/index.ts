import { db } from "@/lib/db";

import {
    PrismaExpenseRepository,
    type ExpenseRepository,
} from "./expense.repository";
import {
    PrismaDashboardRepository,
    type DashboardRepository,
} from "./dashboard.repository";
import {
    PrismaIncomeRepository,
    type IncomeRepository,
} from "./income.repository";

/**
 * Composition root — the single place the concrete Prisma adapters are wired to
 * the real database client. Everything else depends on the repository
 * interfaces, so swapping an implementation (or injecting a fake in tests)
 * happens here, not scattered across the app.
 */
export const expenseRepository: ExpenseRepository = new PrismaExpenseRepository(
    db,
);

export const incomeRepository: IncomeRepository = new PrismaIncomeRepository(
    db,
);

export const dashboardRepository: DashboardRepository =
    new PrismaDashboardRepository(db);

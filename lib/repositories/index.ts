import { db } from "@/lib/db";

import {
    PrismaExpenseRepository,
    type ExpenseRepository,
} from "./expense.repository";

/**
 * Composition root — the single place the concrete Prisma adapter is wired to
 * the real database client. Everything else depends on the `ExpenseRepository`
 * interface, so swapping the implementation (or injecting a fake in tests)
 * happens here, not scattered across the app.
 */
export const expenseRepository: ExpenseRepository = new PrismaExpenseRepository(
    db,
);

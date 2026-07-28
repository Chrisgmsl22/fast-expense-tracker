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
import {
    PrismaCategoryRepository,
    type CategoryRepository,
} from "./category.repository";
import {
    PrismaCategoryBudgetRepository,
    type CategoryBudgetRepository,
} from "./category-budget.repository";
import {
    PrismaMovementRepository,
    type MovementRepository,
} from "./movement.repository";
import {
    PrismaSettlementRepository,
    type SettlementRepository,
} from "./settlement.repository";
import {
    PrismaSettingsRepository,
    type SettingsRepository,
} from "./settings.repository";
import { PrismaCardRepository, type CardRepository } from "./card.repository";
import {
    PrismaUserProvisioningRepository,
    type UserProvisioningRepository,
} from "./user-provisioning.repository";

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

export const categoryRepository: CategoryRepository =
    new PrismaCategoryRepository(db);

export const categoryBudgetRepository: CategoryBudgetRepository =
    new PrismaCategoryBudgetRepository(db);

export const movementRepository: MovementRepository =
    new PrismaMovementRepository(db);

export const settlementRepository: SettlementRepository =
    new PrismaSettlementRepository(db);

export const settingsRepository: SettingsRepository =
    new PrismaSettingsRepository(db);

export const cardRepository: CardRepository = new PrismaCardRepository(db);

/**
 * New-user starter kit (ADR-0022 §3). The owner seed builds its own instance
 * (it runs outside Next with its own client); this is the wiring the signup
 * action injects.
 */
export const userProvisioningRepository: UserProvisioningRepository =
    new PrismaUserProvisioningRepository(db);

import type { PrismaClient } from "@prisma/client";
import type { EffectiveBudgetRule } from "@/lib/domain/budget-rule";
import type { FixedIncomeRow } from "@/lib/domain/fixed-income";

export interface ExportExpense {
    date: Date;
    categoryId: string;
    subcategoryId: string | null;
    cardId: string | null;
    amount: number;
    actualExpenditure: number;
    isShared: boolean;
    yourPercentage: number;
    fundedFrom: string;
    isPartnerPayment: boolean;
}
export interface ExportMovement {
    date: Date;
    type: string;
    amount: number;
    cardId: string | null;
    fundedFrom: string;
}
export interface ExportCategory {
    id: string;
    slug: string;
    name: string;
    isRelevant: boolean;
}
export interface FinancialExportData {
    expenses: ExportExpense[];
    movements: ExportMovement[];
    variableIncome: { date: Date | null; amount: number }[];
    fixedIncome: FixedIncomeRow[];
    budgetRules: EffectiveBudgetRule[];
    cards: {
        id: string;
        name: string;
        type: string;
        archivedAt: Date | null;
    }[];
    categories: ExportCategory[];
    subcategories: { id: string; name: string }[];
}
export interface FinancialExportRepository {
    read(userId: string, start: Date, end: Date): Promise<FinancialExportData>;
}

/** One consistent, read-only snapshot. Private free text never leaves the database. */
export class PrismaFinancialExportRepository implements FinancialExportRepository {
    constructor(private readonly db: PrismaClient) {}
    async read(
        userId: string,
        start: Date,
        end: Date,
    ): Promise<FinancialExportData> {
        return this.db.$transaction(
            async (tx) => {
                const date = { gte: start, lt: end };
                const [
                    expenses,
                    movements,
                    variableIncome,
                    fixedIncome,
                    budgetRules,
                ] = await Promise.all([
                    tx.expense.findMany({
                        where: { userId, date },
                        orderBy: [{ date: "asc" }, { id: "asc" }],
                        select: {
                            date: true,
                            categoryId: true,
                            subcategoryId: true,
                            cardId: true,
                            amount: true,
                            actualExpenditure: true,
                            isShared: true,
                            yourPercentage: true,
                            fundedFrom: true,
                            isPartnerPayment: true,
                        },
                    }),
                    tx.movement.findMany({
                        where: { userId, date },
                        orderBy: [{ date: "asc" }, { id: "asc" }],
                        select: {
                            date: true,
                            type: true,
                            amount: true,
                            cardId: true,
                            fundedFrom: true,
                        },
                    }),
                    tx.income.findMany({
                        where: { userId, type: "VARIABLE", date },
                        orderBy: [{ date: "asc" }, { id: "asc" }],
                        select: { date: true, amount: true },
                    }),
                    tx.income.findMany({
                        where: { userId, type: "FIXED" },
                        orderBy: { createdAt: "asc" },
                        select: { amount: true, effectiveMonth: true },
                    }),
                    tx.budgetRule.findMany({
                        where: { userId },
                        select: {
                            effectiveMonth: true,
                            essentials: true,
                            discretionary: true,
                            savings: true,
                        },
                    }),
                ]);
                const cardIds = [...expenses, ...movements].flatMap((row) =>
                    row.cardId ? [row.cardId] : [],
                );
                const [cards, categories, subcategories] = await Promise.all([
                    tx.card.findMany({
                        where: { userId, id: { in: cardIds } },
                        orderBy: { id: "asc" },
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            archivedAt: true,
                        },
                    }),
                    tx.category.findMany({
                        where: {
                            userId,
                            id: { in: expenses.map((row) => row.categoryId) },
                        },
                        select: {
                            id: true,
                            slug: true,
                            name: true,
                            isRelevant: true,
                        },
                    }),
                    tx.subcategory.findMany({
                        where: {
                            userId,
                            id: {
                                in: expenses.flatMap((row) =>
                                    row.subcategoryId
                                        ? [row.subcategoryId]
                                        : [],
                                ),
                            },
                        },
                        select: { id: true, name: true },
                    }),
                ]);
                return {
                    expenses,
                    movements,
                    variableIncome,
                    fixedIncome,
                    budgetRules,
                    cards,
                    categories,
                    subcategories,
                };
            },
            { isolationLevel: "RepeatableRead" },
        );
    }
}

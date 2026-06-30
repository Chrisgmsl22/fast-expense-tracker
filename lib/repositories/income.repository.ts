import type { PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";

/** One variable-income row, as the log table renders it. */
export type VariableIncomeItem = {
    id: string;
    date: Date;
    source: string;
    amount: number;
};

/** Server-owned fields for inserting a variable-income row. */
export type VariableIncomeWriteData = {
    date: Date;
    source: string;
    amount: number;
};

/**
 * Monthly income breakdown — the single source budget targets read (slice 2.4
 * consumes this instead of the retired `Settings.monthlyIncome` stopgap).
 * `fixed` is the recurring monthly amount; `variable` is the sum logged in the
 * month; `total` is their sum.
 */
export type IncomeMonthlySummary = {
    fixed: number;
    variable: number;
    total: number;
};

/**
 * Data-access contract for income — the "port". Actions/pages depend on this
 * interface, never on Prisma directly, so the implementation is swappable
 * (Prisma adapter in prod, in-memory fake in tests). Mirrors `ExpenseRepository`.
 */
export interface IncomeRepository {
    getMonthlySummary(
        userId: string,
        month: string,
    ): Promise<IncomeMonthlySummary>;
    getVariableForMonth(
        userId: string,
        month: string,
    ): Promise<VariableIncomeItem[]>;
    insertVariable(
        userId: string,
        data: VariableIncomeWriteData,
    ): Promise<{ id: string }>;
    deleteVariableForUser(id: string, userId: string): Promise<number>;
    /** Upsert the user's single FIXED row to `amount`. */
    setFixed(userId: string, amount: number): Promise<void>;
}

/**
 * Prisma-backed implementation — the only place income queries live. The
 * `PrismaClient` is injected via the constructor (not imported), so the class
 * has no knowledge of the app's singleton and is trivially testable with a stub.
 */
export class PrismaIncomeRepository implements IncomeRepository {
    constructor(private readonly db: PrismaClient) {}

    async getMonthlySummary(
        userId: string,
        month: string,
    ): Promise<IncomeMonthlySummary> {
        const { start, end } = getMonthRangeUtc(month);
        const [fixedAgg, variableAgg] = await Promise.all([
            this.db.income.aggregate({
                where: { userId, type: "FIXED" },
                _sum: { amount: true },
            }),
            this.db.income.aggregate({
                where: {
                    userId,
                    type: "VARIABLE",
                    date: { gte: start, lt: end },
                },
                _sum: { amount: true },
            }),
        ]);
        const fixed = fixedAgg._sum.amount ?? 0;
        const variable = variableAgg._sum.amount ?? 0;
        return { fixed, variable, total: fixed + variable };
    }

    async getVariableForMonth(
        userId: string,
        month: string,
    ): Promise<VariableIncomeItem[]> {
        const { start, end } = getMonthRangeUtc(month);
        const rows = await this.db.income.findMany({
            where: { userId, type: "VARIABLE", date: { gte: start, lt: end } },
            orderBy: { date: "desc" },
            select: { id: true, date: true, source: true, amount: true },
        });
        // `source`/`date` are nullable in the schema (FIXED rows omit them) but
        // are always set on VARIABLE rows by the write path; normalize for the
        // non-null list shape.
        return rows.map((r) => ({
            id: r.id,
            date: r.date ?? start,
            source: r.source ?? "",
            amount: r.amount,
        }));
    }

    async insertVariable(
        userId: string,
        data: VariableIncomeWriteData,
    ): Promise<{ id: string }> {
        return this.db.income.create({
            data: {
                userId,
                type: "VARIABLE",
                amount: data.amount,
                source: data.source,
                date: data.date,
            },
            select: { id: true },
        });
    }

    /**
     * `deleteMany` (not `delete`) so the where-clause carries `userId` alongside
     * `id`: a row that isn't the signed-in user's matches nothing, the count
     * stays 0, and the caller reports not-found instead of deleting another
     * user's data (IDOR guard). Scoped to VARIABLE so the FIXED row is never
     * removed through this path.
     */
    async deleteVariableForUser(id: string, userId: string): Promise<number> {
        const result = await this.db.income.deleteMany({
            where: { id, userId, type: "VARIABLE" },
        });
        return result.count;
    }

    /**
     * Upsert the user's single FIXED row. There's no unique constraint on
     * `(userId, type)`, so this is find-then-write — fine for a single-user
     * personal tool with no concurrent writers.
     */
    async setFixed(userId: string, amount: number): Promise<void> {
        const existing = await this.db.income.findFirst({
            where: { userId, type: "FIXED" },
            select: { id: true },
        });
        if (existing) {
            await this.db.income.update({
                where: { id: existing.id },
                data: { amount },
            });
        } else {
            await this.db.income.create({
                data: { userId, type: "FIXED", amount },
            });
        }
    }
}

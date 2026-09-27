import type { Prisma, PrismaClient } from "@prisma/client";

import { getMonthRangeUtc } from "@/lib/dates";
import { resolveEffective } from "@/lib/domain/effective-month";
import { carryForwardRow } from "@/lib/domain/fixed-income";

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
 * `fixed` is the one FIXED amount in force for the month; `variable` is the sum
 * logged in the month; `total` is their sum.
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
    /** Upsert the FIXED amount that applies from `effectiveMonth` onward. */
    setFixed(
        userId: string,
        effectiveMonth: string,
        amount: number,
    ): Promise<void>;
    /** Set the FIXED amount of `month` alone; every other month keeps its amount. */
    setFixedForMonthOnly(
        userId: string,
        month: string,
        amount: number,
    ): Promise<void>;
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
        const [fixedRows, variableAgg] = await Promise.all([
            // Same order as setFixed, so a month with two rows reads the row it writes.
            this.db.income.findMany({
                where: { userId, type: "FIXED" },
                orderBy: { createdAt: "asc" },
                select: { amount: true, effectiveMonth: true },
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
        const fixed = resolveEffective(fixedRows, month)?.amount ?? 0;
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

    async setFixed(
        userId: string,
        effectiveMonth: string,
        amount: number,
    ): Promise<void> {
        await upsertFixedRow(this.db, userId, effectiveMonth, amount);
    }

    // The next month's amount is read before any write, and both writes share
    // one transaction: a failed carry-forward row also undoes the edit of `month`.
    async setFixedForMonthOnly(
        userId: string,
        month: string,
        amount: number,
    ): Promise<void> {
        await this.db.$transaction(async (tx) => {
            const rows = await tx.income.findMany({
                where: { userId, type: "FIXED" },
                orderBy: { createdAt: "asc" },
                select: { amount: true, effectiveMonth: true },
            });
            const carry = carryForwardRow(rows, month);
            await upsertFixedRow(tx, userId, month, amount);
            if (carry) {
                await tx.income.create({
                    data: { userId, type: "FIXED", ...carry },
                });
            }
        });
    }
}

// Find-then-write: no unique constraint covers (userId, effectiveMonth), which is
// fine with no concurrent writers. The undated legacy row never matches.
async function upsertFixedRow(
    db: Prisma.TransactionClient,
    userId: string,
    effectiveMonth: string,
    amount: number,
): Promise<void> {
    const existing = await db.income.findFirst({
        where: { userId, type: "FIXED", effectiveMonth },
        orderBy: { createdAt: "asc" },
        select: { id: true },
    });
    if (existing) {
        await db.income.update({
            where: { id: existing.id },
            data: { amount },
        });
    } else {
        await db.income.create({
            data: { userId, type: "FIXED", effectiveMonth, amount },
        });
    }
}

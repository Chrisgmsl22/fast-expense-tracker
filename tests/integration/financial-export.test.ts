import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { PrismaFinancialExportRepository } from "@/lib/repositories/financial-export.repository";
import { resolveExportPeriod } from "@/lib/export/period";
import { buildFinancialWorkbook } from "@/lib/export/workbook";
import { getDashboardSummary } from "@/lib/services/dashboard/dashboard.service";
import { GET } from "@/app/api/financial-export/route";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth/session", () => ({
    getSessionUserId: async () => session.userId,
}));
const repository = new PrismaFinancialExportRepository(db);
const now = new Date("2026-11-23T18:00:00Z");

describe("financial export (integration)", () => {
    it("scopes all rows and related metadata, preserves archived cards, and uses local date boundaries", async () => {
        const user = await db.user.create({
            data: { email: "export@example.com", name: "Demo" },
        });
        const other = await db.user.create({
            data: { email: "other@example.com", name: "Other" },
        });
        const category = await db.category.create({
            data: { userId: user.id, slug: "housing", name: "Housing" },
        });
        const foreignCategory = await db.category.create({
            data: {
                userId: other.id,
                slug: "secret",
                name: "PRIVATE CATEGORY",
            },
        });
        const foreignSubcategory = await db.subcategory.create({
            data: {
                userId: other.id,
                categoryId: foreignCategory.id,
                name: "PRIVATE SUBCATEGORY",
            },
        });
        const card = await db.card.create({
            data: {
                userId: user.id,
                name: "Archived demo",
                type: "credit",
                color: "#123456",
                archivedAt: now,
            },
        });
        const foreignCard = await db.card.create({
            data: {
                userId: other.id,
                name: "PRIVATE CARD",
                type: "credit",
                color: "#123456",
            },
        });
        for (const [date, amount] of [
            ["2025-01-01T05:59:59Z", 999],
            ["2025-01-01T06:00:00Z", 100],
            ["2025-02-01T05:59:59Z", 200],
            ["2025-02-01T06:00:00Z", 300],
        ] as const)
            await db.expense.create({
                data: {
                    userId: user.id,
                    categoryId: category.id,
                    cardId: card.id,
                    date: new Date(date),
                    description: "PRIVATE DESCRIPTION",
                    notes: "PRIVATE NOTES",
                    amount,
                    actualExpenditure: amount * 0.5,
                    isShared: true,
                    yourPercentage: 0.5,
                },
            });
        await db.expense.create({
            data: {
                userId: other.id,
                categoryId: foreignCategory.id,
                date: new Date("2025-01-10T06:00:00Z"),
                description: "FOREIGN",
                amount: 9999,
                actualExpenditure: 9999,
            },
        });
        // Legacy bad relation: metadata from a different account must not leak.
        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: foreignCategory.id,
                subcategoryId: foreignSubcategory.id,
                cardId: foreignCard.id,
                date: new Date("2025-01-10T06:00:00Z"),
                description: "PRIVATE",
                amount: 1,
                actualExpenditure: 1,
            },
        });
        await db.movement.create({
            data: {
                userId: user.id,
                type: "gf_paid",
                date: new Date("2025-01-12T06:00:00Z"),
                amount: 10,
                note: "PRIVATE MOVEMENT",
                cardId: card.id,
            },
        });
        await db.movement.create({
            data: {
                userId: other.id,
                type: "income",
                date: new Date("2025-01-12T06:00:00Z"),
                amount: 9999,
            },
        });
        await db.income.createMany({
            data: [
                {
                    userId: user.id,
                    type: "FIXED",
                    effectiveMonth: "2025-01",
                    amount: 1000,
                },
                { userId: other.id, type: "FIXED", amount: 9999 },
                {
                    userId: user.id,
                    type: "VARIABLE",
                    amount: 40,
                    date: new Date("2025-01-14T06:00:00Z"),
                    source: "PRIVATE INCOME",
                },
            ],
        });
        await db.budgetRule.createMany({
            data: [
                {
                    userId: user.id,
                    effectiveMonth: "2025-01",
                    essentials: 60,
                    discretionary: 20,
                    savings: 20,
                },
                {
                    userId: other.id,
                    effectiveMonth: "2025-01",
                    essentials: 10,
                    discretionary: 10,
                    savings: 80,
                },
            ],
        });
        const period = resolveExportPeriod(
            { type: "month", period: "2025-01" },
            now,
        )!;
        const data = await repository.read(user.id, period.start, period.end);
        expect(data.expenses.map((row) => row.amount)).toEqual([100, 1, 200]);
        expect(data.cards.map((row) => row.name)).toEqual(["Archived demo"]);
        expect(data.categories.map((row) => row.name)).toEqual(["Housing"]);
        expect(data.subcategories).toEqual([]);
        expect(data.movements.map((row) => row.type)).toEqual(["gf_paid"]);
        expect(data.fixedIncome).toEqual([
            { amount: 1000, effectiveMonth: "2025-01" },
        ]);
        const workbook = buildFinancialWorkbook(data, period);
        const serialized = JSON.stringify(workbook.model);
        expect(serialized).not.toContain("PRIVATE");
        const dashboard = await getDashboardSummary(user.id, "2025-01");
        const summary = workbook.getWorksheet("Monthly summary")!;
        expect(summary.getCell("F2").value).toBe(dashboard.income.total);
        expect(summary.getCell("G2").value).toBe(dashboard.consumptionSpent);
        expect(summary.getCell("J2").value).toBe(dashboard.buckets[0]!.spent);
        expect(summary.getCell("K2").value).toBe(dashboard.buckets[0]!.target);
        const yearPeriod = resolveExportPeriod(
            { type: "year", period: "2025" },
            now,
        )!;
        const yearData = await repository.read(
            user.id,
            yearPeriod.start,
            yearPeriod.end,
        );
        const yearlySummary = buildFinancialWorkbook(
            yearData,
            yearPeriod,
        ).getWorksheet("Monthly summary")!;
        for (const [index, month] of yearPeriod.months.entries()) {
            const monthlyPeriod = resolveExportPeriod(
                { type: "month", period: month },
                now,
            )!;
            const monthlyData = await repository.read(
                user.id,
                monthlyPeriod.start,
                monthlyPeriod.end,
            );
            const monthlySummary = buildFinancialWorkbook(
                monthlyData,
                monthlyPeriod,
            ).getWorksheet("Monthly summary")!;
            expect(yearlySummary.getRow(index + 2).values).toEqual(
                monthlySummary.getRow(2).values,
            );
        }
        session.userId = user.id;
        const response = await GET(
            new Request(
                "http://localhost/api/financial-export?type=month&period=2025-01",
            ),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toContain("no-store");
        session.userId = null;
        expect(
            (
                await GET(
                    new Request(
                        "http://localhost/api/financial-export?type=year&period=2025",
                    ),
                )
            ).status,
        ).toBe(401);
    });
    it("returns no_data for empty periods and cleared fixed income but exports effective fixed-only income", async () => {
        const user = await db.user.create({
            data: { email: "empty-export@example.com", name: "Empty export" },
        });
        session.userId = user.id;
        const request = (period: string, type = "month") =>
            new Request(
                "http://localhost/api/financial-export?type=" +
                    type +
                    "&period=" +
                    period,
            );
        await db.card.create({
            data: {
                userId: user.id,
                name: "Unused card",
                type: "credit",
                color: "#123456",
            },
        });
        await db.budgetRule.create({
            data: {
                userId: user.id,
                effectiveMonth: "2025-01",
                essentials: 50,
                discretionary: 25,
                savings: 25,
            },
        });
        const emptyResponse = await GET(request("2025", "year"));
        expect(emptyResponse.status).toBe(404);
        expect(await emptyResponse.json()).toEqual({ code: "no_data" });
        expect(emptyResponse.headers.get("Content-Disposition")).toBeNull();
        await db.income.createMany({
            data: [
                {
                    userId: user.id,
                    type: "FIXED",
                    effectiveMonth: "2025-07",
                    amount: 1200,
                },
                {
                    userId: user.id,
                    type: "FIXED",
                    effectiveMonth: "2025-08",
                    amount: 0,
                },
            ],
        });
        for (const period of ["2025-06", "2025-08", "2025-09"]) {
            const response = await GET(request(period));
            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ code: "no_data" });
        }
        expect((await GET(request("2025-07"))).status).toBe(200);
        expect((await GET(request("2025", "year"))).status).toBe(200);
        const future = await GET(request("2099", "year"));
        expect(future.status).toBe(404);
        expect(await future.json()).toEqual({ code: "no_data" });
        session.userId = null;
        expect((await GET(request("2099", "year"))).status).toBe(401);
    });
    it("excludes future-dated rows at today's cutoff and partitions a year across months", async () => {
        const user = await db.user.create({
            data: { email: "dates@example.com", name: "Dates" },
        });
        const category = await db.category.create({
            data: { userId: user.id, slug: "housing", name: "Housing" },
        });
        for (const date of [
            "2026-01-01T06:00:00Z",
            "2026-01-31T06:00:00Z",
            "2026-02-01T06:00:00Z",
            "2026-11-23T06:00:00Z",
            "2026-11-24T06:00:00Z",
        ])
            await db.expense.create({
                data: {
                    userId: user.id,
                    categoryId: category.id,
                    date: new Date(date),
                    description: "Invented",
                    amount: 100,
                    actualExpenditure: 100,
                },
            });
        const year = resolveExportPeriod(
            { type: "year", period: "2026" },
            now,
        )!;
        const yearly = await repository.read(user.id, year.start, year.end);
        expect(yearly.expenses).toHaveLength(4);
        const dates: string[] = [];
        for (const month of year.months) {
            const range = resolveExportPeriod(
                { type: "month", period: month },
                now,
            )!;
            dates.push(
                ...(
                    await repository.read(user.id, range.start, range.end)
                ).expenses.map((row) => row.date.toISOString()),
            );
        }
        expect(dates).toEqual(
            yearly.expenses.map((row) => row.date.toISOString()),
        );
        expect(new Set(dates).size).toBe(dates.length);
    });
});

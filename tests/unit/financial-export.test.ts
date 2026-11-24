import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";
import { financialExportSchema } from "@/lib/schemas/financial-export";
import { resolveExportPeriod } from "@/lib/export/period";
import { buildFinancialWorkbook } from "@/lib/export/workbook";
import { financialExportResponse } from "@/lib/export/download";
import type { FinancialExportData } from "@/lib/repositories/financial-export.repository";

const now = new Date("2026-11-24T02:00:00Z");
const empty: FinancialExportData = {
    expenses: [],
    movements: [],
    variableIncome: [],
    fixedIncome: [],
    budgetRules: [],
    cards: [],
    categories: [],
    subcategories: [],
};
const period = (value: string, type: "month" | "year" = "month") =>
    resolveExportPeriod({ type, period: value }, now)!;

describe("financial export periods", () => {
    it("uses Mexico City today, includes no future months, and ends after today's local midnight", () => {
        const result = period("2026", "year");
        expect(result.months).toHaveLength(11);
        expect(result.cutoff).toBe("2026-11-23");
        expect(result.end.toISOString()).toBe("2026-11-24T06:00:00.000Z");
        expect(result.partial).toBe(true);
    });
    it("includes the full completed leap year and validates periods", () => {
        expect(period("2024", "year").months).toHaveLength(12);
        expect(period("2024-02").end.toISOString()).toBe(
            "2024-03-01T06:00:00.000Z",
        );
        expect(period("2025", "year").start.toISOString()).toBe(
            "2025-01-01T06:00:00.000Z",
        );
        expect(
            resolveExportPeriod({ type: "month", period: "2026-12" }, now),
        ).toBeNull();
        expect(
            financialExportSchema.safeParse({
                type: "month",
                period: "2026-13",
            }).success,
        ).toBe(false);
        expect(
            financialExportSchema.safeParse({
                type: "year",
                period: "2026",
                userId: "other",
            }).success,
        ).toBe(false);
    });
});

describe("financial workbook", () => {
    it("keeps six stable sheets and headings in an empty period", async () => {
        const result = buildFinancialWorkbook(empty, period("2025-01"));
        const bytes = await result.xlsx.writeBuffer();
        const reader = new ExcelJS.Workbook();
        await reader.xlsx.load(bytes);
        expect(reader.worksheets.map((sheet) => sheet.name)).toEqual([
            "Monthly summary",
            "Expenses",
            "Income",
            "Cards",
            "Payments & transfers",
            "Guide",
        ]);
        expect(reader.getWorksheet("Expenses")!.rowCount).toBe(1);
        expect(reader.getWorksheet("Income")!.rowCount).toBe(1);
        expect(
            reader.getWorksheet("Monthly summary")!.getCell("D2").value,
        ).toBe(0);
    });
    it("reuses historical income and bucket rules, keeps stored shares and safe plain-text labels", async () => {
        const date = new Date("2025-02-01T06:00:00Z");
        const data: FinancialExportData = {
            ...empty,
            categories: [
                {
                    id: "ess",
                    slug: "housing",
                    name: "=SUM(A1)",
                    isRelevant: true,
                },
                {
                    id: "sav",
                    slug: "savings",
                    name: "Savings",
                    isRelevant: true,
                },
                {
                    id: "un",
                    slug: "unassigned",
                    name: "Unassigned",
                    isRelevant: false,
                },
            ],
            cards: [
                {
                    id: "old",
                    name: "+Archived card",
                    type: "credit",
                    archivedAt: date,
                },
            ],
            fixedIncome: [
                { effectiveMonth: null, amount: 1000 },
                { effectiveMonth: "2025-02", amount: 2000 },
            ],
            variableIncome: [{ date, amount: 100 }],
            budgetRules: [
                {
                    effectiveMonth: "2025-02",
                    essentials: 60,
                    discretionary: 20,
                    savings: 20,
                },
            ],
            expenses: [
                {
                    date,
                    categoryId: "ess",
                    subcategoryId: null,
                    cardId: "old",
                    amount: 100,
                    actualExpenditure: 68,
                    isShared: true,
                    yourPercentage: 0.68,
                    fundedFrom: "income",
                    isPartnerPayment: false,
                },
                {
                    date,
                    categoryId: "sav",
                    subcategoryId: null,
                    cardId: null,
                    amount: 200,
                    actualExpenditure: 200,
                    isShared: false,
                    yourPercentage: 1,
                    fundedFrom: "income",
                    isPartnerPayment: false,
                },
                {
                    date,
                    categoryId: "un",
                    subcategoryId: null,
                    cardId: null,
                    amount: 10,
                    actualExpenditure: 10,
                    isShared: false,
                    yourPercentage: 1,
                    fundedFrom: "income",
                    isPartnerPayment: true,
                },
                ...["savings", "reimbursed"].map((fundedFrom) => ({
                    date,
                    categoryId: "ess",
                    subcategoryId: null,
                    cardId: "old",
                    amount: 999,
                    actualExpenditure: 999,
                    isShared: false,
                    yourPercentage: 1,
                    fundedFrom,
                    isPartnerPayment: false,
                })),
            ],
            movements: [
                {
                    date,
                    type: "gf_fronted",
                    amount: 500,
                    cardId: null,
                    fundedFrom: "income",
                },
                {
                    date,
                    type: "card_payment",
                    amount: 100,
                    cardId: "old",
                    fundedFrom: "income",
                },
                {
                    date,
                    type: "income",
                    amount: 900,
                    cardId: null,
                    fundedFrom: "income",
                },
            ],
        };
        const result = buildFinancialWorkbook(data, period("2025-02"));
        const bytes = await result.xlsx.writeBuffer();
        const reader = new ExcelJS.Workbook();
        await reader.xlsx.load(bytes);
        expect(
            reader.getWorksheet("Monthly summary")!.getRow(2).values,
        ).toEqual([
            undefined,
            "2025-02",
            false,
            "2025-02-28",
            2000,
            100,
            2100,
            78,
            200,
            1822,
            68,
            1260,
            60,
            0,
            420,
            20,
            200,
            420,
            20,
        ]);
        expect(reader.getWorksheet("Expenses")!.getCell("B2").value).toBe(
            "=SUM(A1)",
        );
        expect(reader.getWorksheet("Expenses")!.getCell("G2").value).toBe(68);
        expect(reader.getWorksheet("Cards")!.getCell("D2").value).toBe(true);
        expect(
            reader.getWorksheet("Payments & transfers")!.getCell("F2").value,
        ).toBe(false);
        expect(
            reader.getWorksheet("Payments & transfers")!.getCell("D3").value,
        ).toBe(reader.getWorksheet("Cards")!.getCell("A2").value);
        const year = buildFinancialWorkbook(data, period("2025", "year"));
        expect(year.getWorksheet("Monthly summary")!.getRow(3).values).toEqual(
            reader.getWorksheet("Monthly summary")!.getRow(2).values,
        );
        expect(year.getWorksheet("Monthly summary")!.getCell("D2").value).toBe(
            1000,
        );
    });
});

describe("financial download response", () => {
    const repository = { read: vi.fn(async () => empty) };
    it("rejects signed-out, future, malformed, duplicate, and account-selecting requests without reads", async () => {
        repository.read.mockClear();
        for (const [query, user, status] of [
            ["type=year&period=2025", null, 401],
            ["type=year&period=2027", "me", 400],
            ["type=month&period=2025-13", "me", 400],
            ["type=year&period=2025&period=2026", "me", 400],
            ["type=year&period=2025&userId=other", "me", 400],
        ] as const) {
            const response = await financialExportResponse(
                new Request("http://localhost/api/financial-export?" + query),
                user,
                repository,
                now,
            );
            expect(response.status).toBe(status);
            expect(response.headers.get("Cache-Control")).toContain("no-store");
        }
        expect(repository.read).not.toHaveBeenCalled();
    });
    it("returns a private attachment scoped to the session and handles failures", async () => {
        const response = await financialExportResponse(
            new Request(
                "http://localhost/api/financial-export?type=year&period=2025",
            ),
            "me",
            repository,
            now,
        );
        expect(repository.read).toHaveBeenLastCalledWith(
            "me",
            new Date("2025-01-01T06:00:00Z"),
            new Date("2026-01-01T06:00:00Z"),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Disposition")).toBe(
            'attachment; filename="financial-export-2025.xlsx"',
        );
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
        expect(
            (
                await financialExportResponse(
                    new Request(
                        "http://localhost/api/financial-export?type=year&period=2025",
                    ),
                    "me",
                    {
                        read: async () => {
                            throw new Error("offline");
                        },
                    },
                    now,
                )
            ).status,
        ).toBe(500);
    });
});

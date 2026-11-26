import { afterEach, describe, it, expect, vi } from "vitest";
import * as workbookModule from "@/lib/export/workbook";
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
    it("keeps all six sheet headings when a fixed-income-only export has empty detail tabs", async () => {
        const result = buildFinancialWorkbook(
            {
                ...empty,
                fixedIncome: [{ effectiveMonth: "2025-01", amount: 1000 }],
            },
            period("2025-01"),
        );
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
        expect(reader.getWorksheet("Income")!.rowCount).toBe(2);
        expect(
            reader.getWorksheet("Monthly summary")!.getCell("D2").value,
        ).toBe(1000);
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

afterEach(() => vi.restoreAllMocks());

describe("financial download response", () => {
    const request = (query = "type=year&period=2025") =>
        new Request("http://localhost/api/financial-export?" + query);
    it("rejects signed-out and malformed requests before reading or generating", async () => {
        const repository = { read: vi.fn(async () => empty) };
        const generate = vi.spyOn(workbookModule, "buildFinancialWorkbook");
        for (const [query, user, status, code] of [
            ["type=year&period=2025", null, 401, "unauthenticated"],
            ["type=year&period=2027", null, 401, "unauthenticated"],
            ["type=month&period=2025-13", "me", 400, "validation"],
            ["type=year&period=2025&period=2026", "me", 400, "validation"],
            ["type=year&period=2025&userId=other", "me", 400, "validation"],
        ] as const) {
            const response = await financialExportResponse(
                request(query),
                user,
                repository,
                now,
            );
            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ code });
            expect(response.headers.get("Cache-Control")).toContain("no-store");
        }
        expect(repository.read).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
    });
    it("returns no_data for valid future years and months without reading or generating", async () => {
        const repository = { read: vi.fn(async () => empty) };
        const generate = vi.spyOn(workbookModule, "buildFinancialWorkbook");
        for (const query of [
            "type=year&period=2027",
            "type=month&period=2026-12",
        ]) {
            const response = await financialExportResponse(
                request(query),
                "me",
                repository,
                now,
            );
            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ code: "no_data" });
            expect(response.headers.get("Cache-Control")).toContain("no-store");
            expect(response.headers.get("Content-Disposition")).toBeNull();
        }
        expect(repository.read).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
    });
    it("reads an empty past snapshot once and skips workbook generation", async () => {
        const repository = { read: vi.fn(async () => empty) };
        const generate = vi.spyOn(workbookModule, "buildFinancialWorkbook");
        const response = await financialExportResponse(
            request(),
            "me",
            repository,
            now,
        );
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: "no_data" });
        expect(repository.read).toHaveBeenCalledExactlyOnceWith(
            "me",
            new Date("2025-01-01T06:00:00Z"),
            new Date("2026-01-01T06:00:00Z"),
        );
        expect(generate).not.toHaveBeenCalled();
    });
    it("ignores metadata, undated income and fixed income outside the range or cleared to zero", async () => {
        const generate = vi.spyOn(workbookModule, "buildFinancialWorkbook");
        for (const fixedIncome of [
            [],
            [{ effectiveMonth: "2026-01", amount: 1000 }],
            [{ effectiveMonth: "2025-01", amount: 0 }],
            [
                { effectiveMonth: null, amount: 1000 },
                { effectiveMonth: "2024-12", amount: 0 },
            ],
        ]) {
            const repository = {
                read: vi.fn(async () => ({
                    ...empty,
                    fixedIncome,
                    variableIncome: [{ date: null, amount: 200 }],
                    cards: [
                        {
                            id: "unused",
                            name: "Unused",
                            type: "credit",
                            archivedAt: null,
                        },
                    ],
                    budgetRules: [
                        {
                            effectiveMonth: "2025-01",
                            essentials: 50,
                            discretionary: 25,
                            savings: 25,
                        },
                    ],
                })),
            };
            const response = await financialExportResponse(
                request(),
                "me",
                repository,
                now,
            );
            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ code: "no_data" });
            expect(repository.read).toHaveBeenCalledTimes(1);
        }
        expect(generate).not.toHaveBeenCalled();
    });
    it("permits fixed-only income effective in at least one selected month", async () => {
        const repository = {
            read: vi.fn(async () => ({
                ...empty,
                fixedIncome: [
                    { effectiveMonth: "2025-07", amount: 1200 },
                    { effectiveMonth: "2025-08", amount: 0 },
                ],
            })),
        };
        const response = await financialExportResponse(
            request(),
            "me",
            repository,
            now,
        );
        expect(repository.read).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(200);
        const reader = new ExcelJS.Workbook();
        await reader.xlsx.load(await response.arrayBuffer());
        expect(reader.getWorksheet("Income")!.getCell("D2").value).toBe(1200);
        expect(reader.getWorksheet("Income")!.getCell("D3").value).toBe(0);
        expect(reader.getWorksheet("Expenses")!.rowCount).toBe(1);
        const cleared = await financialExportResponse(
            request("type=month&period=2025-08"),
            "me",
            repository,
            now,
        );
        expect(cleared.status).toBe(404);
        expect(await cleared.json()).toEqual({ code: "no_data" });
    });
    it("keeps populated expense, dated variable-income and movement downloads unchanged", async () => {
        const date = new Date("2025-02-01T06:00:00Z");
        for (const data of [
            {
                ...empty,
                expenses: [
                    {
                        date,
                        categoryId: "housing",
                        subcategoryId: null,
                        cardId: null,
                        amount: 100,
                        actualExpenditure: 68,
                        isShared: true,
                        yourPercentage: 0.68,
                        fundedFrom: "income",
                        isPartnerPayment: false,
                    },
                ],
            },
            { ...empty, variableIncome: [{ date, amount: 200 }] },
            {
                ...empty,
                movements: [
                    {
                        date,
                        type: "gf_fronted",
                        amount: 100,
                        cardId: null,
                        fundedFrom: "income",
                    },
                ],
            },
        ]) {
            const repository = { read: vi.fn(async () => data) };
            const response = await financialExportResponse(
                request(),
                "me",
                repository,
                now,
            );
            expect(repository.read).toHaveBeenCalledExactlyOnceWith(
                "me",
                new Date("2025-01-01T06:00:00Z"),
                new Date("2026-01-01T06:00:00Z"),
            );
            expect(response.status).toBe(200);
            expect(response.headers.get("Cache-Control")).toContain("no-store");
            expect(response.headers.get("Content-Disposition")).toBe(
                'attachment; filename="financial-export-2025.xlsx"',
            );
            expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(
                1000,
            );
        }
    });
    it("reports a repository failure without a workbook", async () => {
        const response = await financialExportResponse(
            request(),
            "me",
            {
                read: async () => {
                    throw new Error("offline");
                },
            },
            now,
        );
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ code: "export_failed" });
    });
});

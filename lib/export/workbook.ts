import ExcelJS from "exceljs";
import { getTodayCdmx } from "@/lib/dates";
import { resolveBudgetRule } from "@/lib/domain/budget-rule";
import {
    computeBuckets,
    savingsSpend,
    type CategorySpend,
} from "@/lib/domain/dashboard";
import { resolveEffective } from "@/lib/domain/effective-month";
import { isBudgetFunded } from "@/lib/domain/funding";
import type { FinancialExportData } from "@/lib/repositories/financial-export.repository";
import type { ExportPeriod } from "./period";

type Cell = string | number | boolean;
function sheet(
    workbook: ExcelJS.Workbook,
    name: string,
    headings: string[],
    rows: Cell[][],
): void {
    const worksheet = workbook.addWorksheet(name);
    worksheet.addRow(headings);
    rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.columns.forEach((column) => {
        column.width = 24;
    });
    worksheet.eachRow((row, index) => {
        if (index === 1) return;
        row.eachCell((cell) => {
            if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
        });
    });
    worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: rows.length + 1, column: headings.length },
    };
}

/** Strings remain XLSX string cells, including labels that begin with '='. No formulas or external links. */
export function buildFinancialWorkbook(
    data: FinancialExportData,
    period: ExportPeriod,
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const categories = new Map(data.categories.map((row) => [row.id, row]));
    const subcategories = new Map(
        data.subcategories.map((row) => [row.id, row.name]),
    );
    // Export-local references avoid exposing database identifiers and never resolve foreign cards.
    const cards = new Map(
        data.cards.map((row, index) => [row.id, "card-" + (index + 1)]),
    );
    const cardRef = (id: string | null): string =>
        id === null ? "cash" : (cards.get(id) ?? "unavailable");
    const summary: Cell[][] = [];
    const incomes: Cell[][] = [];
    for (const month of period.months) {
        const fixed = resolveEffective(data.fixedIncome, month);
        const variables = data.variableIncome.filter(
            (row) => row.date && getTodayCdmx(row.date).slice(0, 7) === month,
        );
        const variable = variables.reduce((sum, row) => sum + row.amount, 0);
        const totalIncome = (fixed?.amount ?? 0) + variable;
        if (fixed) incomes.push([month, "", "FIXED", fixed.amount]);
        variables.forEach((row) =>
            incomes.push([
                month,
                row.date ? getTodayCdmx(row.date) : "",
                "VARIABLE",
                row.amount,
            ]),
        );
        const spends = new Map<string, CategorySpend>();
        for (const expense of data.expenses) {
            if (
                getTodayCdmx(expense.date).slice(0, 7) !== month ||
                !isBudgetFunded(expense.fundedFrom)
            )
                continue;
            const category = categories.get(expense.categoryId);
            if (!category) continue;
            const current = spends.get(category.id);
            spends.set(category.id, {
                ...category,
                color: "",
                spent: (current?.spent ?? 0) + expense.actualExpenditure,
            });
        }
        const categorySpends = [...spends.values()];
        const savings = savingsSpend(categorySpends);
        const outflow = categorySpends.reduce((sum, row) => sum + row.spent, 0);
        const buckets = computeBuckets(
            categorySpends,
            totalIncome,
            resolveBudgetRule(data.budgetRules, month),
        );
        const cutoff =
            month === period.cutoff.slice(0, 7)
                ? period.cutoff
                : new Date(
                      Date.UTC(
                          Number(month.slice(0, 4)),
                          Number(month.slice(5, 7)),
                          0,
                      ),
                  )
                      .toISOString()
                      .slice(0, 10);
        summary.push([
            month,
            period.partial && month === period.cutoff.slice(0, 7),
            cutoff,
            fixed?.amount ?? 0,
            variable,
            totalIncome,
            outflow - savings,
            savings,
            totalIncome - outflow,
            ...buckets.flatMap((bucket) => [
                bucket.spent,
                bucket.target,
                bucket.percent,
            ]),
        ]);
    }
    sheet(
        workbook,
        "Monthly summary",
        [
            "Month",
            "Partial month",
            "Cutoff date",
            "Fixed income MXN",
            "Variable income MXN",
            "Total income MXN",
            "Budget spending MXN",
            "Savings MXN",
            "Remaining MXN",
            "Essentials actual MXN",
            "Essentials target MXN",
            "Essentials percent",
            "Discretionary actual MXN",
            "Discretionary target MXN",
            "Discretionary percent",
            "Savings actual MXN",
            "Savings target MXN",
            "Savings percent",
        ],
        summary,
    );
    sheet(
        workbook,
        "Expenses",
        [
            "Date",
            "Category",
            "Category slug",
            "Subcategory",
            "Card reference",
            "Full charge MXN",
            "Personal share MXN",
            "Shared",
            "Saved share fraction",
            "Funding source",
            "Partner payment",
        ],
        data.expenses.map((row) => [
            getTodayCdmx(row.date),
            categories.get(row.categoryId)?.name ?? "unavailable",
            categories.get(row.categoryId)?.slug ?? "unavailable",
            row.subcategoryId
                ? (subcategories.get(row.subcategoryId) ?? "unavailable")
                : "",
            cardRef(row.cardId),
            row.amount,
            row.actualExpenditure,
            row.isShared,
            row.yourPercentage,
            row.fundedFrom,
            row.isPartnerPayment,
        ]),
    );
    sheet(workbook, "Income", ["Month", "Date", "Type", "Amount MXN"], incomes);
    sheet(
        workbook,
        "Cards",
        ["Card reference", "Card label", "Type", "Archived"],
        data.cards.map((row) => [
            cards.get(row.id) ?? "unavailable",
            row.name,
            row.type,
            row.archivedAt !== null,
        ]),
    );
    sheet(
        workbook,
        "Payments & transfers",
        [
            "Date",
            "Movement type",
            "Amount MXN",
            "Card reference",
            "Funding source",
            "Cash moved",
        ],
        data.movements.map((row) => [
            getTodayCdmx(row.date),
            row.type,
            row.amount,
            cardRef(row.cardId),
            row.fundedFrom,
            row.type !== "gf_fronted",
        ]),
    );
    sheet(
        workbook,
        "Guide",
        ["Field", "Meaning"],
        [
            ["Export period", period.label],
            ["First date", getTodayCdmx(period.start)],
            ["Cutoff date", period.cutoff],
            ["Time zone", "America/Mexico_City (UTC-6)"],
            ["Currency", "MXN"],
            [
                "Monthly summary",
                "Use for budget comparisons. Budget spending is saved personal share excluding Savings. Remaining subtracts spending and savings from total income.",
            ],
            [
                "Budget buckets",
                "Use the split in effect each month. Savings is its own bucket. Unassigned is included in spending but excluded from buckets. Savings-funded and reimbursed expenses stay in detail but are excluded from the budget.",
            ],
            [
                "Partial month",
                "The current month includes transactions through the cutoff date. Targets and fixed income are full monthly amounts, without proration.",
            ],
            [
                "Expenses",
                "One saved expense per row. Full charge MXN is the purchase charge. Personal share MXN is the stored personal cost; do not recompute it with current sharing settings. Shared and Saved share fraction describe the original split. Funding source identifies income, savings, or reimbursed. Partner payment identifies money sent to the partner.",
            ],
            [
                "Income",
                "FIXED is the configured amount in force that month, including zero. VARIABLE is one dated entry. A blank fixed-income Date means the amount applies to the whole Month. Free-text income labels are excluded.",
            ],
            [
                "Cards",
                "Card reference joins detail tabs to card labels and types. Archived includes referenced archived cards. cash means no card was attached; unavailable means related metadata could not be resolved within this account. References are local to this workbook.",
            ],
            [
                "Payments & transfers",
                "A separate journal, not expense spending or budget income. card_payment repays a card, gf_received is money received from the partner, gf_paid is a legacy partner payment, gf_fronted is provisional debt with no cash moved. income and other remain legacy journal entries. Amounts are positive; movement type describes their meaning. Funding source matters only for legacy gf_paid.",
            ],
            [
                "Private text",
                "Descriptions, notes, income labels, account names and email addresses are excluded. Card and category labels remain plain text.",
            ],
            [
                "Dates and amounts",
                "Transaction Date and Cutoff date are YYYY-MM-DD in Mexico City. Month is YYYY-MM. Amounts are numeric MXN cells. Percent columns are whole percentages; Saved share fraction is a fraction from 0 to 1.",
            ],
        ],
    );
    return workbook;
}

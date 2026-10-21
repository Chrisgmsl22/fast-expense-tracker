import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";
import { formatExpenseDate } from "@/lib/format";

import { CategoryExpenses } from "@/components/category/CategoryExpenses";
import type { CategoryExpenseListItem } from "@/lib/repositories/category.repository";

/**
 * A row as the repository returns it. `countedInBudget` defaults to the verdict
 * the DB filter would give; a test sets it explicitly only to build the case
 * where the two disagree.
 */
function exp(
    over: Partial<CategoryExpenseListItem> & { id: string },
): CategoryExpenseListItem {
    // Honour the override: hardcoding it makes a non-income row unreachable.
    const fundedFrom = over.fundedFrom ?? "income";
    return {
        id: over.id,
        date: over.date ?? new Date("2026-06-19T12:00:00Z"),
        description: over.description ?? "Dr. Salinas",
        amount: over.amount ?? 1400,
        actualExpenditure: over.actualExpenditure ?? 1400,
        fundedFrom,
        countedInBudget: over.countedInBudget ?? fundedFrom === "income",
        isShared: over.isShared ?? false,
        isPartnerPayment: over.isPartnerPayment ?? false,
        cycleClosedAt: over.cycleClosedAt ?? null,
        category: over.category ?? {
            id: "cat1",
            slug: "health",
            name: "Health",
            color: "#0d9488",
        },
        // `in` checks (not `??`) so an explicit null overrides the default.
        subcategory:
            "subcategory" in over
                ? over.subcategory!
                : { id: "sub1", name: "Doctors appt" },
        card: "card" in over ? over.card! : { name: "BBVA", color: "#2563eb" },
    };
}

describe("CategoryExpenses", () => {
    it("renders each row with description, subcategory, card, and amount", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[exp({ id: "e1" })]}
                color="#0d9488"
                partnerName="Avery"
            />,
        );
        expect(screen.getByText("Dr. Salinas")).toBeDefined();
        expect(screen.getByText("Doctors appt")).toBeDefined();
        expect(screen.getByText(/BBVA/)).toBeDefined();
        expect(screen.getByText("$1,400.00")).toBeDefined();
    });

    it("shows a my-share subtext only on shared rows", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        isShared: true,
                        isPartnerPayment: false,
                        amount: 1000,
                        actualExpenditure: 680,
                        fundedFrom: "income" as const,
                    }),
                ]}
                color="#0d9488"
                partnerName="Avery"
            />,
        );
        expect(screen.getByText(/my share \$680\.00/)).toBeDefined();
    });

    it("omits the my-share subtext on a solo expense", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[exp({ id: "e1", isShared: false })]}
                color="#0d9488"
                partnerName="Avery"
            />,
        );
        expect(screen.queryByText(/my share/)).toBeNull();
    });

    it("omits the subcategory label and card meta when an expense has neither", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        description: "Uncategorized",
                        subcategory: null,
                        card: null, // cash — no " · <card>" suffix
                    }),
                ]}
                color="#0d9488"
                partnerName="Avery"
            />,
        );
        expect(screen.getByText("Uncategorized")).toBeDefined();
        expect(screen.queryByText("Doctors appt")).toBeNull();
        expect(screen.queryByText(/BBVA/)).toBeNull();
    });

    it("badges a savings-funded row, which the header's Spent leaves out", () => {
        // The gap this closes: the row is on screen at $3,000 while `spent`
        // above counts it as nothing (spec 0007 §2). Without the badge the
        // screen contradicts itself and says nothing about why.
        renderWithIntl(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        description: "Shoes",
                        amount: 3000,
                        actualExpenditure: 3000,
                        fundedFrom: "savings",
                    }),
                ]}
                color="#0d9488"
                partnerName="Avery"
            />,
        );
        expect(screen.getByText("Shoes")).toBeDefined();
        expect(screen.getByText("from savings")).toBeDefined();
    });

    it("badges a reimbursed row too", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[exp({ id: "e1", fundedFrom: "reimbursed" })]}
                color="#0d9488"
                partnerName="Avery"
            />,
        );
        expect(screen.getByText("reimbursed")).toBeDefined();
    });

    it("leaves an income-funded row unbadged", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[exp({ id: "e1" })]}
                color="#0d9488"
                partnerName="Avery"
            />,
        );
        expect(screen.queryByText(/from savings|reimbursed/)).toBeNull();
        expect(screen.queryByText(/not from income/i)).toBeNull();
    });

    it("badges a row the budget dropped even when it narrows to income", () => {
        // An out-of-band stored value: the SQL filter dropped it, so it sits in
        // the header's figure, but `toFundingSource` reads it back as `income`.
        renderWithIntl(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        description: "Airline credit",
                        amount: 900,
                        actualExpenditure: 900,
                        fundedFrom: "income",
                        countedInBudget: false,
                    }),
                ]}
                color="#0d9488"
                partnerName="Avery"
            />,
        );
        expect(screen.getByText("Airline credit")).toBeDefined();
        expect(screen.getByText("not from income")).toBeDefined();
        // It must not borrow a source it cannot prove.
        expect(screen.queryByText(/from savings|reimbursed/)).toBeNull();
    });

    it("shows an empty state when the category has no expenses", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[]}
                color="#0d9488"
                partnerName="Avery"
            />,
        );
        expect(
            screen.getByText(/no expenses in this category this month/i),
        ).toBeDefined();
    });
});

describe("CategoryExpenses in Spanish", () => {
    it("translates the heading, subcategory name, share line, and date", () => {
        const date = new Date("2026-06-19T12:00:00Z");
        renderWithIntl(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        date,
                        isShared: true,
                        actualExpenditure: 700,
                        subcategory: { id: "sub2", name: "Dentist" },
                    }),
                ]}
                color="#0d9488"
                partnerName="Avery"
            />,
            { locale: "es" },
        );
        expect(screen.getByText("Gastos en esta categoría")).toBeDefined();
        expect(screen.getByText("Dentista")).toBeDefined();
        expect(screen.getByText("mi parte $700.00")).toBeDefined();
        expect(
            screen.getByText(formatExpenseDate(date, "es"), { exact: false }),
        ).toBeDefined();
    });

    it("keeps a subcategory the owner created as stored", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        subcategory: { id: "s9", name: "Pilates" },
                    }),
                ]}
                color="#0d9488"
                partnerName="Avery"
            />,
            { locale: "es" },
        );
        expect(screen.getByText("Pilates")).toBeDefined();
    });

    it("translates a partner payment's auto-label and keeps a typed note", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "p1",
                        description: "Transfer — you paid Avery",
                        isPartnerPayment: true,
                        card: null,
                    }),
                    exp({
                        id: "p2",
                        description: "Half of the rent",
                        isPartnerPayment: true,
                        card: null,
                    }),
                ]}
                color="#0d9488"
                partnerName="Avery"
            />,
            { locale: "es" },
        );
        expect(
            screen.getByText("Transferencia — le pagaste a Avery"),
        ).toBeDefined();
        expect(screen.queryByText("Transfer — you paid Avery")).toBeNull();
        expect(screen.getByText("Half of the rent")).toBeDefined();
    });

    it("shows the Spanish empty state", () => {
        renderWithIntl(
            <CategoryExpenses
                expenses={[]}
                color="#0d9488"
                partnerName="Avery"
            />,
            {
                locale: "es",
            },
        );
        expect(
            screen.getByText("No hay gastos en esta categoría este mes."),
        ).toBeDefined();
    });
});

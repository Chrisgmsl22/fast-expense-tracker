// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

// DMMF is static metadata baked into the generated client — no DB connection
// needed, so this validates the schema shape in CI without a Postgres service.
const fieldsByModel = new Map(
    Prisma.dmmf.datamodel.models.map((model) => [
        model.name,
        model.fields.map((field) => field.name),
    ]),
);

const fieldOf = (model: string, name: string) =>
    Prisma.dmmf.datamodel.models
        .find((m) => m.name === model)
        ?.fields.find((f) => f.name === name);

describe("Prisma schema", () => {
    it("Should define the seven core models", () => {
        expect([...fieldsByModel.keys()].sort()).toEqual([
            "Card",
            "Category",
            "Expense",
            "Movement",
            "Settings",
            "Subcategory",
            "User",
        ]);
    });

    it("Should carry the shared-expense math fields on Expense", () => {
        expect(fieldsByModel.get("Expense")).toEqual(
            expect.arrayContaining([
                "amount",
                "isShared",
                "yourPercentage",
                "actualExpenditure",
                "paidBy", // spec 0003 — who fronted the money
            ]),
        );
    });

    it("Should carry the forward-compat fields on Expense", () => {
        expect(fieldsByModel.get("Expense")).toEqual(
            expect.arrayContaining([
                "isRecurring",
                "originalAmount",
                "originalCurrency",
            ]),
        );
    });

    it("Should have dropped the one-directional settlement fields (spec 0003)", () => {
        const expense = fieldsByModel.get("Expense") ?? [];
        expect(expense).not.toContain("settlementStatus");
        expect(expense).not.toContain("paidAt");
    });

    it("Should model Movement as the actual-money-movement log (spec 0003)", () => {
        expect(fieldsByModel.get("Movement")).toEqual(
            expect.arrayContaining([
                "date",
                "amount",
                "type",
                "cardId",
                "note",
                "userId",
            ]),
        );
    });

    it("Should give Settings the single-user config fields", () => {
        expect(fieldsByModel.get("Settings")).toEqual(
            expect.arrayContaining([
                "userId",
                "monthlyIncome",
                "defaultSharePercentage",
                "emailDay",
                "recurringPromptSuppressed",
            ]),
        );
    });

    it("Should keep monthlyBudget and carry a color on Category", () => {
        expect(fieldsByModel.get("Category")).toEqual(
            expect.arrayContaining([
                "slug",
                "isRelevant",
                "monthlyBudget",
                "color",
            ]),
        );
        expect(fieldOf("Category", "color")).toMatchObject({
            type: "String",
            hasDefaultValue: true,
        });
    });

    it("Should lock the shared-expense field types and defaults", () => {
        // actualExpenditure is stored (required, not nullable) so historical
        // splits stay correct when the default share % changes — domain-reference §2.
        expect(fieldOf("Expense", "actualExpenditure")).toMatchObject({
            type: "Float",
            isRequired: true,
        });
        expect(fieldOf("Expense", "yourPercentage")).toMatchObject({
            type: "Float",
            hasDefaultValue: true,
            default: 1,
        });
        expect(fieldOf("Expense", "amount")).toMatchObject({
            type: "Float",
            isRequired: true,
        });
    });

    it("Should default paidBy to 'you' and isShared to false", () => {
        expect(fieldOf("Expense", "paidBy")).toMatchObject({
            type: "String",
            default: "you",
        });
        expect(fieldOf("Expense", "isShared")).toMatchObject({
            type: "Boolean",
            default: false,
        });
    });

    it("Should default Settings.defaultSharePercentage to 0.68", () => {
        expect(fieldOf("Settings", "defaultSharePercentage")).toMatchObject({
            type: "Float",
            default: 0.68,
        });
    });
});

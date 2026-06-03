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
    it("Should define the six core models", () => {
        expect([...fieldsByModel.keys()].sort()).toEqual([
            "Card",
            "Category",
            "Expense",
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
            ]),
        );
    });

    it("Should carry all forward-compat fields on Expense", () => {
        expect(fieldsByModel.get("Expense")).toEqual(
            expect.arrayContaining([
                "isRecurring",
                "settlementStatus",
                "paidAt",
                "originalAmount",
                "originalCurrency",
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

    it("Should keep monthlyBudget on Category", () => {
        expect(fieldsByModel.get("Category")).toEqual(
            expect.arrayContaining(["slug", "isRelevant", "monthlyBudget"]),
        );
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

    it("Should default settlementStatus to not_shared and isShared to false", () => {
        expect(fieldOf("Expense", "settlementStatus")).toMatchObject({
            type: "String",
            default: "not_shared",
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

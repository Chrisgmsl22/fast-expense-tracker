import { getTranslations } from "next-intl/server";
import { describe, expect, it } from "vitest";

import { authMessages } from "@/app/_actions/auth/schema-messages";
import { cardSchemaMessages } from "@/app/_actions/card/schema-messages";
import { expenseSchemaMessages } from "@/app/_actions/expense/field-messages";
import { incomeSchemaMessages } from "@/app/_actions/income/field-messages";
import {
    budgetRuleMessages,
    splitRuleMessages,
} from "@/app/_actions/settings/schema-messages";
import { setServerLocale } from "@/tests/support/intl";

// In English each table must map a shared-schema message to itself, so the
// English UI keeps the exact wording the schemas emit.
describe.each([
    ["splitRuleMessages", splitRuleMessages],
    ["budgetRuleMessages", budgetRuleMessages],
    ["cardSchemaMessages", cardSchemaMessages],
    ["authMessages", authMessages],
    [
        "expenseSchemaMessages",
        async () => expenseSchemaMessages(await getTranslations("expenses")),
    ],
    [
        "incomeSchemaMessages",
        async () => incomeSchemaMessages(await getTranslations("income")),
    ],
])("%s", (_name, build) => {
    it("Should map every message to itself in English", async () => {
        const table = await build();
        expect(Object.keys(table).length).toBeGreaterThan(0);
        for (const [english, translated] of Object.entries(table)) {
            expect(translated).toBe(english);
        }
    });

    it("Should translate every message in Spanish", async () => {
        setServerLocale("es");
        const table = await build();
        const unchanged = Object.entries(table).filter(
            ([english, translated]) => english === translated,
        );
        expect(unchanged).toEqual([]);
    });
});

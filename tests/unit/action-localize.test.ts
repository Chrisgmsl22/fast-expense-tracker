import { describe, expect, it } from "vitest";

import { authMessages } from "@/app/_actions/auth/schema-messages";
import { cardSchemaMessages } from "@/app/_actions/card/schema-messages";
import {
    localizeFieldErrors,
    localizeMessage,
} from "@/app/_actions/settings/localize";
import {
    budgetRuleMessages,
    splitRuleMessages,
} from "@/app/_actions/settings/schema-messages";
import { setServerLocale } from "@/tests/support/intl";

const translations = { "Name is required": "El nombre es obligatorio" };

describe("localizeMessage", () => {
    it("Should return the translation for a known message", () => {
        expect(localizeMessage("Name is required", translations)).toBe(
            "El nombre es obligatorio",
        );
    });

    it("Should pass an unknown message through unchanged", () => {
        expect(localizeMessage("Invalid input", translations)).toBe(
            "Invalid input",
        );
    });

    it("Should not read inherited properties as translations", () => {
        expect(localizeMessage("constructor", translations)).toBe(
            "constructor",
        );
    });
});

describe("localizeFieldErrors", () => {
    it("Should translate every message and keep the field keys", () => {
        expect(
            localizeFieldErrors<{ name: string; email: string }>(
                { name: ["Name is required", "Other"], email: undefined },
                translations,
            ),
        ).toEqual({ name: ["El nombre es obligatorio", "Other"] });
    });
});

// In English each table must map a shared-schema message to itself, so the
// English UI keeps the exact wording the schemas emit.
describe.each([
    ["splitRuleMessages", splitRuleMessages],
    ["budgetRuleMessages", budgetRuleMessages],
    ["cardSchemaMessages", cardSchemaMessages],
    ["authMessages", authMessages],
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

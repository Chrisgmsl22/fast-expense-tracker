// @vitest-environment node
import { describe, expect, it } from "vitest";

import { safeErrorSummary } from "@/lib/safe-error";

describe("safeErrorSummary", () => {
    it("Should keep the class name and a string code but drop the message", () => {
        const error = Object.assign(
            new Error('Unique constraint failed: email "ana@example.com"'),
            { code: "P2002" },
        );

        expect(safeErrorSummary(error)).toEqual({
            name: "Error",
            code: "P2002",
        });
    });

    it("Should leave out a code that is not a string", () => {
        expect(
            safeErrorSummary(Object.assign(new TypeError("x"), { code: 42 })),
        ).toEqual({ name: "TypeError" });
    });

    it.each([
        ["a string", "ana@example.com", "string"],
        ["an object", { email: "ana@example.com" }, "object"],
        ["undefined", undefined, "undefined"],
    ])(
        "Should report only the type when %s is thrown",
        (_case, thrown, name) => {
            expect(safeErrorSummary(thrown)).toEqual({ name });
        },
    );
});

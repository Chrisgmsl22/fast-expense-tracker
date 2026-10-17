// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
    PASSWORD_RULES,
    firstPasswordProblem,
    passwordRuleStatuses,
    passwordStrength,
    type PasswordRuleId,
} from "@/lib/domain/password-rules";

const FIXTURE = "Invented-pass-123";

function rule(id: PasswordRuleId) {
    const found = PASSWORD_RULES.find((r) => r.id === id);
    if (!found) throw new Error(`No rule ${id}`);
    return found;
}

describe("PASSWORD_RULES", () => {
    it("Should list the five rules in checklist order", () => {
        expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
            "length",
            "uppercase",
            "lowercase",
            "number",
            "special",
        ]);
    });

    it.each([
        ["length", "x".repeat(8), "x".repeat(7)],
        ["uppercase", "A", "a"],
        ["uppercase", "Ñ", "ñ"],
        ["lowercase", "a", "A"],
        ["lowercase", "ñ", "Ñ"],
        ["number", "7", "x"],
        ["special", "!", "a"],
        ["special", " ", "1"],
        ["special", "-", "Ñ"],
    ] as const)(
        "Should judge the %s rule: %j meets it, %j does not",
        (id, meets, fails) => {
            expect(rule(id).test(meets)).toBe(true);
            expect(rule(id).test(fails)).toBe(false);
        },
    );

    it("Should count characters, not UTF-16 units, for the length rule", () => {
        expect(rule("length").test("😀".repeat(4))).toBe(false);
    });

    it("Should not count an accent written as a combining mark as special", () => {
        expect(rule("special").test("é")).toBe(false);
    });

    it("Should give every rule a checklist label and a field message", () => {
        for (const r of PASSWORD_RULES) {
            expect(r.label).toBeTruthy();
            expect(r.message).toMatch(/^Password must /);
        }
    });
});

describe("passwordRuleStatuses", () => {
    it("Should mark every rule met for a password with all five", () => {
        expect(
            passwordRuleStatuses(FIXTURE).every((status) => status.met),
        ).toBe(true);
    });

    it("Should mark each rule independently", () => {
        expect(
            passwordRuleStatuses("abc").map((s) => [s.rule.id, s.met]),
        ).toEqual([
            ["length", false],
            ["uppercase", false],
            ["lowercase", true],
            ["number", false],
            ["special", false],
        ]);
    });
});

describe("passwordStrength", () => {
    it.each([
        ["", "weak"],
        ["a", "weak"],
        ["aA", "weak"],
        ["aA1", "fair"],
        ["aA1!", "fair"],
        [FIXTURE, "strong"],
    ] as const)("Should rate %j as %s", (password, strength) => {
        expect(passwordStrength(password)).toBe(strength);
    });
});

describe("firstPasswordProblem", () => {
    it("Should accept a password meeting all five rules", () => {
        expect(firstPasswordProblem(FIXTURE)).toBeUndefined();
    });

    it.each([
        ["", "Password must be at least 8 characters"],
        ["aaaaaaaa", "Password must include an uppercase letter"],
        ["AAAAAAAA", "Password must include a lowercase letter"],
        ["Aaaaaaaa", "Password must include a number"],
        ["Aaaaaaa1", "Password must include a special character"],
    ])("Should report the first unmet rule for %j", (password, message) => {
        expect(firstPasswordProblem(password)).toBe(message);
    });

    it("Should accept 72 characters", () => {
        expect(firstPasswordProblem("Aa1!" + "x".repeat(68))).toBeUndefined();
    });

    it("Should reject 73 characters", () => {
        expect(firstPasswordProblem("Aa1!" + "x".repeat(69))).toBe(
            "Password must be 72 characters or fewer",
        );
    });

    it("Should accept exactly 72 bytes of accented letters", () => {
        expect(firstPasswordProblem("Aa1!" + "ñ".repeat(34))).toBeUndefined();
    });

    it("Should reject a password under 72 characters that bcrypt would truncate", () => {
        expect(firstPasswordProblem("Aa1!" + "ñ".repeat(35))).toBe(
            "Password is too long. Use fewer accented letters or symbols.",
        );
    });
});

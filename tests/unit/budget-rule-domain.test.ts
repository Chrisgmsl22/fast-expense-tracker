// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
    DEFAULT_BUDGET_RULE,
    resolveBudgetRule,
    type EffectiveBudgetRule,
} from "@/lib/domain/budget-rule";

const july: EffectiveBudgetRule = {
    effectiveMonth: "2026-07",
    essentials: 60,
    discretionary: 20,
    savings: 20,
};
const october: EffectiveBudgetRule = {
    effectiveMonth: "2026-10",
    essentials: 40,
    discretionary: 30,
    savings: 30,
};

// Guards: the resolver is new, so every case fails pre-fix (no module).
describe("resolveBudgetRule", () => {
    it("Should return 50/25/25 when the user has no rules", () => {
        expect(resolveBudgetRule([], "2026-09")).toEqual({
            essentials: 50,
            discretionary: 25,
            savings: 25,
        });
        expect(DEFAULT_BUDGET_RULE).toEqual({
            essentials: 50,
            discretionary: 25,
            savings: 25,
        });
    });

    it("Should apply a rule to its own month and every later month", () => {
        expect(resolveBudgetRule([july], "2026-07")).toMatchObject({
            essentials: 60,
        });
        expect(resolveBudgetRule([july], "2027-01")).toMatchObject({
            essentials: 60,
        });
    });

    it("Should keep the default for a month before the first rule", () => {
        expect(resolveBudgetRule([july], "2026-06")).toEqual(
            DEFAULT_BUDGET_RULE,
        );
    });

    it("Should keep the older rule for a month before a newer one", () => {
        const rules = [july, october];
        expect(resolveBudgetRule(rules, "2026-09")).toEqual({
            essentials: 60,
            discretionary: 20,
            savings: 20,
        });
        expect(resolveBudgetRule(rules, "2026-10")).toEqual({
            essentials: 40,
            discretionary: 30,
            savings: 30,
        });
    });

    it("Should keep a past month's split after a new rule is saved", () => {
        const before = resolveBudgetRule([july], "2026-08");
        const after = resolveBudgetRule([july, october], "2026-08");
        expect(after).toEqual(before);
    });

    it("Should pick the latest applicable rule whatever the input order", () => {
        expect(resolveBudgetRule([october, july], "2026-12")).toMatchObject({
            essentials: 40,
        });
    });

    it("Should compare across a year boundary", () => {
        const december: EffectiveBudgetRule = {
            ...october,
            effectiveMonth: "2026-12",
        };
        expect(resolveBudgetRule([december], "2027-01")).toMatchObject({
            essentials: 40,
        });
        expect(resolveBudgetRule([december], "2026-11")).toEqual(
            DEFAULT_BUDGET_RULE,
        );
    });

    it("Should return only the split, not the effective month", () => {
        expect(resolveBudgetRule([july], "2026-07")).not.toHaveProperty(
            "effectiveMonth",
        );
    });
});

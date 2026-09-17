import { describe, expect, it } from "vitest";

import {
    BUDGET_FUNDING_FILTER,
    FUNDING_SOURCES,
    allowsReimbursed,
    fundingSourceAfterCategoryChange,
    isBudgetFunded,
    toFundingSource,
} from "@/lib/domain/funding";

describe("funding source (spec 0007 §2/§3.1)", () => {
    it("offers exactly the three values, income first", () => {
        expect(FUNDING_SOURCES).toEqual(["income", "savings", "reimbursed"]);
    });

    it("filters the budget on income at the data boundary", () => {
        // The where-fragment every budget read spreads in. Asserted so a rename
        // of the column can't silently turn the filter into a no-op.
        expect(BUDGET_FUNDING_FILTER).toEqual({ fundedFrom: "income" });
    });

    describe("allowsReimbursed", () => {
        it("allows the value only on health", () => {
            expect(allowsReimbursed("health")).toBe(true);
        });

        it("refuses every other category", () => {
            expect(allowsReimbursed("shopping")).toBe(false);
            expect(allowsReimbursed("savings")).toBe(false);
        });

        it("fails closed when the category didn't resolve", () => {
            expect(allowsReimbursed(null)).toBe(false);
        });
    });

    describe("toFundingSource", () => {
        it("passes the three known values through", () => {
            for (const value of FUNDING_SOURCES) {
                expect(toFundingSource(value)).toBe(value);
            }
        });

        it("falls back to income on an unrecognised stored value", () => {
            // The column is a plain String. An unknown value must never make
            // spend vanish from the budget — it reverts to the counted default.
            expect(toFundingSource("gift")).toBe("income");
            expect(toFundingSource("")).toBe("income");
        });
    });

    describe("isBudgetFunded", () => {
        it("answers exactly what the SQL filter asks", () => {
            expect(isBudgetFunded(BUDGET_FUNDING_FILTER.fundedFrom)).toBe(true);
            expect(isBudgetFunded("savings")).toBe(false);
            expect(isBudgetFunded("reimbursed")).toBe(false);
        });

        it("calls an out-of-band value not-budget-funded, unlike the mapping", () => {
            // The two deliberately disagree: SQL drops this row from every budget
            // figure while `toFundingSource` reads it back as `income`, so no
            // badge is lost.
            expect(isBudgetFunded("gift")).toBe(false);
            expect(isBudgetFunded("")).toBe(false);
            expect(toFundingSource("gift")).toBe("income");
        });
    });
    describe("fundingSourceAfterCategoryChange", () => {
        // Covers the form branch that clears a doomed `reimbursed` choice. The
        // server rule is tested separately in update-expense; this is the
        // convenience that stops the user submitting a form bound to fail.
        it("drops reimbursed when the category leaves health", () => {
            expect(
                fundingSourceAfterCategoryChange("reimbursed", "shopping"),
            ).toBe("income");
        });

        it("drops reimbursed when the category doesn't resolve", () => {
            expect(fundingSourceAfterCategoryChange("reimbursed", null)).toBe(
                "income",
            );
        });

        it("keeps reimbursed while the category is still health", () => {
            expect(
                fundingSourceAfterCategoryChange("reimbursed", "health"),
            ).toBe("reimbursed");
        });

        it("never touches income or savings, whatever the category", () => {
            for (const slug of ["health", "shopping", null]) {
                expect(fundingSourceAfterCategoryChange("income", slug)).toBe(
                    "income",
                );
                expect(fundingSourceAfterCategoryChange("savings", slug)).toBe(
                    "savings",
                );
            }
        });
    });
});

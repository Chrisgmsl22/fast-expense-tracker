// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// `setCategoryBudget` calls `auth()`; mock it so these stay pure unit tests.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { setCategoryBudget } from "@/app/_actions/category/set-budget";
import type { CategoryBudgetRepository } from "@/lib/repositories/category-budget.repository";
import type {
    CategoryMeta,
    CategoryRepository,
} from "@/lib/repositories/category.repository";

const meta: CategoryMeta = {
    id: "cat1",
    slug: "health",
    name: "Health",
    color: "#0d9488",
    isRelevant: true,
    monthlyBudget: 4000,
};

function catRepo(found: CategoryMeta | null = meta): CategoryRepository {
    return {
        getBySlug: async () => found,
        getSubcategorySpends: async () => [],
        getExpensesForCategoryMonth: async () => [],
    };
}

function budgetRepo() {
    return {
        getOverride: vi.fn(),
        getOverridesForMonth: vi.fn(),
        setBudget: vi.fn().mockResolvedValue(undefined),
    } satisfies CategoryBudgetRepository;
}

const valid = {
    slug: "health",
    month: "2026-06",
    thisMonthAmount: "1800",
    defaultAmount: "1500",
};

describe("setCategoryBudget (unit, injected fakes)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("rejects invalid input before touching auth or repos", async () => {
        const res = await setCategoryBudget(
            {
                slug: "",
                month: "nope",
                thisMonthAmount: "x",
                defaultAmount: "",
            },
            budgetRepo(),
            catRepo(),
        );
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("validation");
    });

    it("returns unauthenticated when there is no session", async () => {
        authMock.mockResolvedValue(null);
        const res = await setCategoryBudget(valid, budgetRepo(), catRepo());
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("unauthenticated");
    });

    it("returns not_found for an unknown slug", async () => {
        const res = await setCategoryBudget(valid, budgetRepo(), catRepo(null));
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("not_found");
    });

    it("writes the default and the month override atomically", async () => {
        const budget = budgetRepo();
        const res = await setCategoryBudget(valid, budget, catRepo());
        expect(res.ok).toBe(true);
        // One atomic call: (categoryId, month, defaultAmount, thisMonthAmount).
        expect(budget.setBudget).toHaveBeenCalledWith(
            "cat1",
            "2026-06",
            1500,
            1800,
        );
    });

    it("passes null for this month when it is blank (clears the override)", async () => {
        const budget = budgetRepo();
        const res = await setCategoryBudget(
            { ...valid, thisMonthAmount: "" },
            budget,
            catRepo(),
        );
        expect(res.ok).toBe(true);
        expect(budget.setBudget).toHaveBeenCalledWith(
            "cat1",
            "2026-06",
            1500,
            null,
        );
    });

    it("passes null for the default when it is blank", async () => {
        const budget = budgetRepo();
        await setCategoryBudget(
            { ...valid, defaultAmount: "" },
            budget,
            catRepo(),
        );
        expect(budget.setBudget).toHaveBeenCalledWith(
            "cat1",
            "2026-06",
            null,
            1800,
        );
    });

    it("maps a write failure to db_error", async () => {
        const budget = budgetRepo();
        budget.setBudget.mockRejectedValue(new Error("boom"));
        const res = await setCategoryBudget(valid, budget, catRepo());
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("db_error");
    });
});

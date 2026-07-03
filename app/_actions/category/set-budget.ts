"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import {
    categoryBudgetRepository,
    categoryRepository,
} from "@/lib/repositories";
import type { CategoryBudgetRepository } from "@/lib/repositories/category-budget.repository";
import type { CategoryRepository } from "@/lib/repositories/category.repository";
import {
    categoryBudgetInputSchema,
    type CategoryBudgetInput,
} from "@/lib/schemas/category";

/** Failure modes the caller can branch on. */
export type SetCategoryBudgetCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

export type SetCategoryBudgetResult = ActionResult<
    { slug: string },
    CategoryBudgetInput,
    SetCategoryBudgetCode
>;

/**
 * Set a category's monthly limit for a given month + its default (ADR-0016).
 *
 * Orchestration only: validate → authenticate → resolve the category by slug →
 * write the default and the month override (a null `thisMonthAmount` clears the
 * override; a null `defaultAmount` clears the default) → map failures. Budgets
 * are global, so there is no per-user scoping — but a session is still required.
 * The caller refreshes the page on success (no `revalidatePath`, matching the
 * other actions in this repo).
 */
export async function setCategoryBudget(
    input: unknown,
    budgetRepo: CategoryBudgetRepository = categoryBudgetRepository,
    categoryRepo: CategoryRepository = categoryRepository,
): Promise<SetCategoryBudgetResult> {
    const parsed = categoryBudgetInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid budget",
            fieldErrors: toFieldErrors<CategoryBudgetInput>(parsed.error),
        };
    }

    const session = await auth();
    if (!session?.user?.id) {
        return {
            ok: false,
            code: "unauthenticated",
            message: "Not authenticated",
        };
    }

    const { slug, month, thisMonthAmount, defaultAmount } = parsed.data;

    const category = await categoryRepo.getBySlug(slug);
    if (!category) {
        return {
            ok: false,
            code: "not_found",
            message: "Category not found",
        };
    }

    try {
        await budgetRepo.setBudget(
            category.id,
            month,
            defaultAmount,
            thisMonthAmount,
        );
        return { ok: true, data: { slug } };
    } catch (e) {
        console.error("setCategoryBudget: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the limit. Please try again.",
        };
    }
}

"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { frontedDescription } from "@/lib/domain/expense";
import { resolvePartnerName } from "@/lib/domain/settings";
import {
    categoryRepository,
    expenseRepository,
    settingsRepository,
} from "@/lib/repositories";
import type { CategoryRepository } from "@/lib/repositories/category.repository";
import type { ExpenseRepository } from "@/lib/repositories/expense.repository";
import type { SettingsRepository } from "@/lib/repositories/settings.repository";
import {
    frontedExpenseInputSchema,
    type FrontedExpenseInput,
} from "@/lib/schemas/expense";

/** Failure modes the caller can branch on. */
export type AddFrontedExpenseCode =
    | "validation"
    | "unauthenticated"
    | "db_error";

export type AddFrontedExpenseResult = ActionResult<
    { id: string },
    FrontedExpenseInput,
    AddFrontedExpenseCode
>;

/** Injectable seams — the repositories this action orchestrates. */
export type AddFrontedExpenseDeps = {
    expenseRepo: ExpenseRepository;
    categoryRepo: CategoryRepository;
    settingsRepo: SettingsRepository;
};

/**
 * Log a purchase the partner fronted, which you owe her back (spec 0007 §6a).
 *
 * It is stored as an **Expense** carrying `isFronted`, not a movement: it is
 * real consumption from this month's income, so it belongs in the buckets and
 * the category rollups like any other purchase. It reaches the budget on
 * purpose; what it must never reach is spend-by-card (the partner's card moved,
 * not yours — BUG-1) or the cash-out figure (the transfer that settles it is the
 * cash event). Both of those exclude it at their own read.
 *
 * **The amount is your share**, never what she actually paid, so no split is
 * applied: `amount` and `actualExpenditure` are equal and `isShared` is false.
 * Category and subcategory default to `combined-expenses` / "Covered for me";
 * the row is an ordinary expense afterwards, so both are editable from the
 * expense form.
 */
export async function addFrontedExpense(
    input: unknown,
    deps: Partial<AddFrontedExpenseDeps> = {},
): Promise<AddFrontedExpenseResult> {
    const expenseRepo = deps.expenseRepo ?? expenseRepository;
    const categoryRepo = deps.categoryRepo ?? categoryRepository;
    const settingsRepo = deps.settingsRepo ?? settingsRepository;

    const parsed = frontedExpenseInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid debt",
            fieldErrors: toFieldErrors<FrontedExpenseInput>(parsed.error),
        };
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: "Not authenticated",
        };
    }

    const v = parsed.data;
    try {
        const defaults = await categoryRepo.getFrontedDefaults(userId);
        const categoryId = v.categoryId ?? defaults?.categoryId;
        if (!categoryId) {
            // No category to file it under and none supplied: refuse loudly
            // rather than invent one or drop the row on the floor.
            return {
                ok: false,
                code: "validation",
                message:
                    "No category to file this under. Add a Combined Expenses category first.",
                fieldErrors: { categoryId: ["Category is required"] },
            };
        }

        // The default subcategory only applies to the default category — pairing
        // it with a category the user picked would persist a mismatched FK pair.
        const subcategoryId =
            v.subcategoryId ??
            (v.categoryId ? null : (defaults?.subcategoryId ?? null));
        if (subcategoryId) {
            const owner =
                await expenseRepo.getSubcategoryCategoryId(subcategoryId);
            if (owner !== categoryId) {
                return {
                    ok: false,
                    code: "validation",
                    message: "Invalid debt",
                    fieldErrors: {
                        subcategoryId: [
                            "Subcategory doesn't belong to the selected category",
                        ],
                    },
                };
            }
        }

        const { partnerName } = await settingsRepo.getSettings(userId);
        const created = await expenseRepo.insert(userId, {
            categoryId,
            subcategoryId,
            // No card of yours moved — hers did. The null is why spend-by-card
            // has to exclude the row rather than group it.
            cardId: null,
            date: cdmxCalendarDateToUtc(v.date),
            description: frontedDescription(
                v.note,
                resolvePartnerName(partnerName),
            ),
            amount: v.amount,
            isShared: false,
            yourPercentage: 1,
            actualExpenditure: v.amount,
            paidBy: "you",
            notes: null,
            isFronted: true,
        });
        return { ok: true, data: { id: created.id } };
    } catch (e) {
        console.error("addFrontedExpense: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the debt. Please try again.",
        };
    }
}

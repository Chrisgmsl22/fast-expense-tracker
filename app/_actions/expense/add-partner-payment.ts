"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { partnerPaymentDescription } from "@/lib/domain/expense";
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
    partnerPaymentInputSchema,
    type PartnerPaymentInput,
} from "@/lib/schemas/expense";

/** Failure modes the caller can branch on. */
export type AddPartnerPaymentCode =
    | "validation"
    | "unauthenticated"
    | "db_error";

export type AddPartnerPaymentResult = ActionResult<
    { id: string },
    PartnerPaymentInput,
    AddPartnerPaymentCode
>;

/** Injectable seams — the repositories this action orchestrates. */
export type AddPartnerPaymentDeps = {
    expenseRepo: ExpenseRepository;
    categoryRepo: CategoryRepository;
    settingsRepo: SettingsRepository;
};

/**
 * Log money you sent the partner (spec 0007 §6b).
 *
 * It is stored as an **Expense** carrying `isPartnerPayment`, not a movement:
 * paying her is the moment the money is really spent, so it belongs in the
 * buckets and the category rollups like any other purchase. A debt she fronted
 * does not — it is provisional until money moves, and can be reduced or
 * cancelled by something she owes you. That is why this action, and not the debt
 * form, is the one that reaches the budget.
 *
 * It stays out of spend-by-card: a payment usually leaves a bank account with no
 * card attached, and a cardless row read as "Cash" is what BUG-1 looked like.
 *
 * **No split is applied**: the amount is what you sent, so `amount` and
 * `actualExpenditure` are equal and `isShared` is false. Category and
 * subcategory default to `combined-expenses` / "Covered for me"; the row is an
 * ordinary expense afterwards, so both are editable from the expense form.
 */
export async function addPartnerPayment(
    input: unknown,
    deps: Partial<AddPartnerPaymentDeps> = {},
): Promise<AddPartnerPaymentResult> {
    const expenseRepo = deps.expenseRepo ?? expenseRepository;
    const categoryRepo = deps.categoryRepo ?? categoryRepository;
    const settingsRepo = deps.settingsRepo ?? settingsRepository;

    const parsed = partnerPaymentInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid debt",
            fieldErrors: toFieldErrors<PartnerPaymentInput>(parsed.error),
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
        const defaults = await categoryRepo.getPartnerPaymentDefaults(userId);
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
            description: partnerPaymentDescription(
                v.note,
                resolvePartnerName(partnerName),
            ),
            amount: v.amount,
            isShared: false,
            yourPercentage: 1,
            actualExpenditure: v.amount,
            paidBy: "you",
            notes: null,
            isPartnerPayment: true,
        });
        return { ok: true, data: { id: created.id } };
    } catch (e) {
        console.error("addPartnerPayment: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the debt. Please try again.",
        };
    }
}

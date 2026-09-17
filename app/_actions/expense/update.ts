"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import {
    computeActualExpenditure,
    movesSettlementBalance,
} from "@/lib/domain/expense";
import { expenseRepository } from "@/lib/repositories";
import type { ExpenseRepository } from "@/lib/repositories/expense.repository";
import {
    expenseFundingSchema,
    expenseInputSchema,
    type ExpenseInput,
} from "@/lib/schemas/expense";

/** The edit payload carries the row id alongside the expense fields. */
const idSchema = z.object({ id: z.string().min(1) });

/** Failure modes the caller can branch on. `not_found` also covers "not yours". */
export type UpdateExpenseCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    /** The row sits in a closed settlement cycle, so it is frozen (spec 0007 §3.5). */
    | "cycle_closed"
    | "db_error";

export type UpdateExpenseResult = ActionResult<
    { id: string },
    ExpenseInput,
    UpdateExpenseCode
>;

/**
 * Update an existing expense for the signed-in user. Mirrors `createExpense`
 * (validate → recompute server-side → persist), but the write is **scoped by
 * `userId`** in the repository so a mismatch matches zero rows and returns
 * `not_found` instead of mutating another user's data (IDOR guard).
 * A **partner payment** is never split: `actualExpenditure` is what the balance
 * reads as "what he paid her", so a 68% split would shrink the payment by a third.
 * A row a closed settlement cycle counted is refused (spec 0007 §3.5).
 */
export async function updateExpense(
    input: unknown,
    repo: ExpenseRepository = expenseRepository,
): Promise<UpdateExpenseResult> {
    const parsed = expenseInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid expense",
            fieldErrors: toFieldErrors<ExpenseInput>(parsed.error),
        };
    }
    // Validate the id through Zod too, rather than hand-casting `input` — the
    // action's argument is `unknown` precisely so nothing is read untyped.
    const idParsed = idSchema.safeParse(input);
    if (!idParsed.success) {
        return { ok: false, code: "validation", message: "Invalid expense" };
    }
    const { id } = idParsed.data;

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
        // The slug is resolved from the DB, never taken from the client (spec 0007 §3.3).
        const categorySlug = await repo.getCategorySlug(userId, v.categoryId);
        const funding = expenseFundingSchema.safeParse({
            fundedFrom: v.fundedFrom,
            categorySlug,
        });
        if (!funding.success) {
            return {
                ok: false,
                code: "validation",
                message: "Invalid expense",
                fieldErrors: toFieldErrors<ExpenseInput>(funding.error),
            };
        }

        if (v.subcategoryId) {
            const categoryId = await repo.getSubcategoryCategoryId(
                v.subcategoryId,
            );
            if (categoryId !== v.categoryId) {
                return {
                    ok: false,
                    code: "validation",
                    message: "Invalid expense",
                    fieldErrors: {
                        subcategoryId: [
                            "Subcategory doesn't belong to the selected category",
                        ],
                    },
                };
            }
        }

        // The row's payment flag and its cycle are the server's facts, never the
        // payload's; a missing row short-circuits here instead of after the write.
        const existing = await repo.getById(userId, id);
        if (!existing) {
            return {
                ok: false,
                code: "not_found",
                message: "Expense not found.",
            };
        }

        // A stray `yourPercentage` on a payment payload must not reach the row.
        const money = existing.isPartnerPayment
            ? {
                  isShared: false,
                  yourPercentage: 1,
                  actualExpenditure: v.amount,
              }
            : {
                  isShared: v.isShared,
                  yourPercentage: v.yourPercentage,
                  actualExpenditure: computeActualExpenditure(v),
              };

        // An expense has no marker column, so the refusal is here, not in the repository.
        // Both the row as stored and the row as it WOULD be are checked: ticking "shared"
        // inside a closed cycle adds a partner share to a filed balance.
        if (existing.cycleClosedAt) {
            const after = {
                amount: v.amount,
                actualExpenditure: money.actualExpenditure,
                isPartnerPayment: existing.isPartnerPayment,
            };
            if (movesSettlementBalance(existing)) {
                return {
                    ok: false,
                    code: "cycle_closed",
                    message: existing.isPartnerPayment
                        ? "This payment counts in a settlement you already closed, so it can't be edited."
                        : "Your partner's share of this expense counts in a settlement you already closed, so it can't be edited.",
                };
            }
            if (movesSettlementBalance(after)) {
                return {
                    ok: false,
                    code: "cycle_closed",
                    message:
                        "This expense sits inside a settlement you already closed, so it can't be split with your partner now — that would change what the settlement settled.",
                    fieldErrors: {
                        isShared: [
                            "The settlement covering this date is already closed",
                        ],
                    },
                };
            }
        }

        // Refused, not coerced: answering "saved" to a change that was dropped is a
        // silent save failure. It runs AFTER the closed-cycle check, so a frozen row is
        // not handed a rule it could satisfy and still be refused.
        if (existing.isPartnerPayment && (v.isShared || v.cardId)) {
            return {
                ok: false,
                code: "validation",
                message:
                    "A payment you sent your partner can't be split or charged to a card — the amount you enter is the whole transfer.",
                fieldErrors: {
                    ...(v.isShared
                        ? {
                              yourPercentage: [
                                  "This amount is the whole payment you sent",
                              ],
                          }
                        : {}),
                    ...(v.cardId
                        ? {
                              cardId: [
                                  "A transfer leaves a bank account, so there is no card",
                              ],
                          }
                        : {}),
                },
            };
        }

        const count = await repo.updateForUser(id, userId, {
            categoryId: v.categoryId,
            subcategoryId: v.subcategoryId ?? null,
            // A transfer leaves a bank account, so a payment row has no card to
            // point at, and leaving one on would put it back in spend-by-card.
            cardId: existing.isPartnerPayment ? null : (v.cardId ?? null),
            date: cdmxCalendarDateToUtc(v.date),
            description: v.description,
            amount: v.amount,
            ...money,
            paidBy: v.paidBy,
            fundedFrom: v.fundedFrom,
            notes: v.notes ?? null,
        });
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "Expense not found.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updateExpense: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save changes. Please try again.",
        };
    }
}

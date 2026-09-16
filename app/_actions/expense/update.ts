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
import { expenseInputSchema, type ExpenseInput } from "@/lib/schemas/expense";

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
 *
 * A **partner payment**'s money is clamped here (spec 0007 §6b). The amount on
 * such a row is what he transferred to her, so no split may ever be applied to
 * it. Without the clamp, ticking "shared" at 68% on a $680 payment would store
 * `actualExpenditure` 462.40, and the settlement balance reads exactly that
 * field as what he has paid her: the payment would shrink by a third with
 * nothing on screen saying so.
 *
 * A row a **closed settlement cycle counted** is refused: the cycle is a filed
 * record, and editing a row it counted restates a settlement the user was told
 * could not be reopened. So is an edit that would ADD a partner share to such a
 * cycle. An unshared row inside one counts for nothing there and stays editable.
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

        // Load the row before writing: whether it is a partner payment, and
        // whether its cycle is closed, are the server's facts, never the
        // payload's. A missing row also short-circuits to `not_found` here
        // instead of after the write attempt.
        const existing = await repo.getById(userId, id);
        if (!existing) {
            return {
                ok: false,
                code: "not_found",
                message: "Expense not found.",
            };
        }

        // Belt and braces on a payment row: the figure entered IS the
        // consumption, so `amount` and `actualExpenditure` stay equal whatever
        // else rode along (a stray `yourPercentage` on an unshared payload).
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

        // A filed settlement is frozen on BOTH sides. The movement repository
        // freezes the cycle marker at the data boundary; an expense has no such
        // column, so the refusal is here.
        //
        // What it refuses is narrower than "any old row": a closed cycle counted
        // only the rows that MOVED its balance, so those are the rows it may
        // freeze. Refusing on the marker alone locked every expense ever entered
        // before any close — a solo lunch included — and told the user it was
        // part of a settlement it never entered.
        //
        // Both the row as stored and the row as it WOULD be are checked. Ticking
        // "shared" on a solo row inside a closed cycle adds a partner share to a
        // filed balance, which is the same restatement from the other direction.
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

        // A payload that asks to split a payment to the partner, or to charge it
        // to a card, is REFUSED rather than quietly coerced. The form disables
        // both controls, so this only fires on a request that went around it —
        // and answering such a request with "saved" would tell the caller a
        // change landed when none did. Accept-then-ignore is the shape of the
        // silent save failure this repo already shipped once.
        //
        // It runs AFTER the closed-cycle check on purpose. A frozen payment
        // cannot be saved in any shape, so naming the split rule first would
        // hand the user a rule they could satisfy and still be refused — the
        // wrong reason told first is the one they act on.
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

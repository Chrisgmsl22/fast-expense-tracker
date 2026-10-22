"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { auth } from "@/auth";
import { localizeFieldErrors, toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { computeActualExpenditure } from "@/lib/domain/expense";
import { isExpenseFrozen } from "@/lib/domain/frozen-row";
import { cardRepository, expenseRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import type { ExpenseRepository } from "@/lib/repositories/expense.repository";
import {
    expenseFundingSchema,
    expenseInputSchema,
    type ExpenseInput,
} from "@/lib/schemas/expense";

import { expenseSchemaMessages, frozenRefusalKey } from "./field-messages";

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
    cards: CardRepository = cardRepository,
): Promise<UpdateExpenseResult> {
    const t = await getTranslations("expenses");
    const parsed = expenseInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.invalidExpense"),
            fieldErrors: localizeFieldErrors(
                toFieldErrors<ExpenseInput>(parsed.error),
                expenseSchemaMessages(t),
            ),
        };
    }
    // Validate the id through Zod too, rather than hand-casting `input` — the
    // action's argument is `unknown` precisely so nothing is read untyped.
    const idParsed = idSchema.safeParse(input);
    if (!idParsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.invalidExpense"),
        };
    }
    const { id } = idParsed.data;

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: t("errors.unauthenticated"),
        };
    }

    const v = parsed.data;

    try {
        // The row's payment flag and its cycle are the server's facts, never the
        // payload's. Read first, so another user's row answers not_found whatever
        // the payload names.
        const existing = await repo.getById(userId, id);
        if (!existing) {
            return {
                ok: false,
                code: "not_found",
                message: t("errors.notFound"),
            };
        }

        // The slug is resolved from the DB, never taken from the client (spec 0007 §3.3).
        const categorySlug = await repo.getCategorySlug(userId, v.categoryId);
        if (categorySlug === null) {
            return {
                ok: false,
                code: "validation",
                message: t("errors.invalidExpense"),
                fieldErrors: { categoryId: [t("fields.categoryNotFound")] },
            };
        }
        const funding = expenseFundingSchema.safeParse({
            fundedFrom: v.fundedFrom,
            categorySlug,
        });
        if (!funding.success) {
            return {
                ok: false,
                code: "validation",
                message: t("errors.invalidExpense"),
                fieldErrors: localizeFieldErrors(
                    toFieldErrors<ExpenseInput>(funding.error),
                    expenseSchemaMessages(t),
                ),
            };
        }

        if (v.subcategoryId) {
            const categoryId = await repo.getSubcategoryCategoryId(
                userId,
                v.subcategoryId,
            );
            if (categoryId !== v.categoryId) {
                return {
                    ok: false,
                    code: "validation",
                    message: t("errors.invalidExpense"),
                    fieldErrors: {
                        subcategoryId: [t("fields.subcategoryMismatch")],
                    },
                };
            }
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

        // The repository's write is not scoped by the cycle, so the refusal is here.
        // Both the row as stored and the row as it WOULD be are checked: ticking "shared"
        // inside a closed cycle adds a partner share to a filed balance.
        const refusal = frozenRefusalKey(existing, "edit");
        if (refusal) {
            return {
                ok: false,
                code: "cycle_closed",
                message: t(`errors.frozen.${refusal}`),
            };
        }
        const after = {
            amount: v.amount,
            actualExpenditure: money.actualExpenditure,
            isPartnerPayment: existing.isPartnerPayment,
            cycleClosedAt: existing.cycleClosedAt,
        };
        if (isExpenseFrozen(after)) {
            return {
                ok: false,
                code: "cycle_closed",
                message: t("errors.splitIntoClosedCycle"),
                fieldErrors: {
                    isShared: [t("fields.splitClosedCycle")],
                },
            };
        }

        // Refused, not coerced: answering "saved" to a change that was dropped is a
        // silent save failure. It runs AFTER the closed-cycle check, so a frozen row is
        // not handed a rule it could satisfy and still be refused.
        if (existing.isPartnerPayment && (v.isShared || v.cardId)) {
            return {
                ok: false,
                code: "validation",
                message: t("errors.paymentNoSplitOrCard"),
                fieldErrors: {
                    ...(v.isShared
                        ? {
                              yourPercentage: [t("fields.paymentWholeAmount")],
                          }
                        : {}),
                    ...(v.cardId
                        ? {
                              cardId: [t("fields.paymentNoCard")],
                          }
                        : {}),
                },
            };
        }

        // Same silent-save concern as the split/card guard above: a payment's
        // category is fixed at creation, and the owner's rule is that a
        // payment is never reimbursed (spec 0007 §3.3 stays Health-only).
        if (existing.isPartnerPayment) {
            const categoryChanged = v.categoryId !== existing.categoryId;
            const subcategoryChanged =
                (v.subcategoryId ?? null) !== existing.subcategoryId;
            const reimbursed = v.fundedFrom === "reimbursed";
            if (categoryChanged || subcategoryChanged || reimbursed) {
                return {
                    ok: false,
                    code: "validation",
                    message: t("errors.paymentKeepsCategory"),
                    fieldErrors: {
                        ...(categoryChanged
                            ? {
                                  categoryId: [
                                      t("fields.paymentCategoryFixed"),
                                  ],
                              }
                            : {}),
                        ...(subcategoryChanged
                            ? {
                                  subcategoryId: [
                                      t("fields.paymentCategoryFixed"),
                                  ],
                              }
                            : {}),
                        ...(reimbursed
                            ? {
                                  fundedFrom: [
                                      t("fields.paymentNeverReimbursed"),
                                  ],
                              }
                            : {}),
                    },
                };
            }
        }

        if (v.cardId && !(await cards.findByIdForUser(userId, v.cardId))) {
            return {
                ok: false,
                code: "validation",
                message: t("errors.invalidExpense"),
                fieldErrors: { cardId: [t("fields.cardNotFound")] },
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
                message: t("errors.notFound"),
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updateExpense: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("errors.saveChangesFailed"),
        };
    }
}

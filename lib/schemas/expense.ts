import { z } from "zod";

import {
    FUNDING_SOURCES,
    REIMBURSABLE_CATEGORY_SLUG,
    allowsReimbursed,
} from "@/lib/domain/funding";

/**
 * Validation for capturing an expense (slice 1.4).
 *
 * Form inputs arrive as strings, so numerics and the date are coerced. The
 * server action owns CDMX→UTC date conversion and the `actualExpenditure`
 * computation (spec 0001 §3).
 */
export const expenseInputSchema = z
    .object({
        date: z.coerce.date(),
        amount: z.coerce.number().positive("Amount must be greater than 0"),
        categoryId: z.string().min(1, "Category is required"),
        subcategoryId: z.string().min(1).optional(),
        cardId: z.string().min(1).optional(), // omitted = cash
        description: z.string().min(1, "Description is required").max(200),
        notes: z.string().max(1000).optional(),
        isShared: z.boolean().default(false),
        yourPercentage: z.coerce.number().min(0).max(1).default(1),
        // DEPRECATED (ADR-0020): every expense is the user's own. Locked to
        // "you" so no request can reintroduce a partner-fronted expense — a
        // thing the partner fronted is a `gf_fronted` movement now, never an
        // expense. Kept on the schema until the `paidBy` column is dropped.
        paidBy: z.literal("you").default("you"),
        // Defaulted, so a form that never sends the field keeps today's behaviour.
        fundedFrom: z.enum(FUNDING_SOURCES).default("income"),
    })
    .refine((v) => !v.isShared || v.yourPercentage < 1, {
        message: "A shared expense needs your share below 100%",
        path: ["yourPercentage"],
    });

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

/**
 * The Health restriction on `reimbursed` (spec 0007 §3.3). Its own schema
 * because the rule reads the category's *slug*, which the action resolves from
 * the database — the client never supplies it. Create and update both run it.
 */
export const expenseFundingSchema = z
    .object({
        fundedFrom: z.enum(FUNDING_SOURCES),
        /** Resolved server-side from `categoryId`; null when it doesn't resolve. */
        categorySlug: z.string().nullable(),
    })
    .refine(
        (v) =>
            v.fundedFrom !== "reimbursed" || allowsReimbursed(v.categorySlug),
        {
            message: `Only ${REIMBURSABLE_CATEGORY_SLUG} expenses can be marked reimbursed. Change the funding source before moving this expense to another category.`,
            path: ["fundedFrom"],
        },
    );

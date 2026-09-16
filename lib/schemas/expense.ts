import { z } from "zod";

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
        // "you" so no request can retype who paid. Money the user SENT the
        // partner is marked by `isPartnerPayment`, which this form cannot set —
        // see `partnerPaymentInputSchema`. (A debt she fronted is not an expense
        // at all, spec 0007 §6b.) Kept until the `paidBy` column is dropped.
        paidBy: z.literal("you").default("you"),
    })
    .refine((v) => !v.isShared || v.yourPercentage < 1, {
        message: "A shared expense needs your share below 100%",
        path: ["yourPercentage"],
    });

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

/**
 * Money the user SENT the partner — a payment out of his own account, which is
 * the thing that counts in his budget (spec 0007 §6b). Not a debt she fronted:
 * that is provisional, lives in settlement only, and never reaches this schema.
 *
 * The amount entered is what he transferred, so there is no `isShared` and no
 * `yourPercentage` to submit: the action stores `amount` and `actualExpenditure`
 * equal. Category and subcategory are optional and default to
 * `combined-expenses` and its partner-payment subcategory; sending them lets the
 * user file the payment somewhere else.
 */
export const partnerPaymentInputSchema = z.object({
    date: z.coerce.date(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    note: z.string().max(200).optional(),
    categoryId: z.string().min(1).optional(),
    subcategoryId: z.string().min(1).optional(),
});

export type PartnerPaymentInput = z.infer<typeof partnerPaymentInputSchema>;

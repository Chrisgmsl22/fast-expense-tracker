import { z } from "zod";

/**
 * Validation for the Settings "Expense split rule" block (spec 0006 / CHORE-6.a).
 * The toggle gates its own inputs: when `sharesExpenses` is on, a partner name is
 * required. The share percentage arrives as a 1–100 integer from the form and is
 * converted to a fraction in the domain layer (`resolveSplitRule`).
 */
export const splitRuleInputSchema = z
    .object({
        sharesExpenses: z.boolean(),
        partnerName: z.string().trim().max(80, "Name is too long").optional(),
        // The share input only renders when sharing is on, so a Solo save sends
        // an empty string. Normalize blanks to `undefined` and enforce the 1–100
        // range only when a value is present; the superRefine below requires it
        // when sharing is on.
        sharePercentage: z.preprocess(
            (val) => (val === "" || val == null ? undefined : val),
            z.coerce
                .number()
                .int("Enter a whole number")
                .min(1, "Must be at least 1%")
                .max(100, "Can't exceed 100%")
                .optional(),
        ),
    })
    .superRefine((val, ctx) => {
        if (val.sharesExpenses && !val.partnerName?.trim()) {
            ctx.addIssue({
                code: "custom",
                path: ["partnerName"],
                message: "Add your partner's name to share expenses",
            });
        }
        if (val.sharesExpenses && val.sharePercentage === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["sharePercentage"],
                message: "Enter your share (1–100%)",
            });
        }
    });

export type SplitRuleInput = z.infer<typeof splitRuleInputSchema>;

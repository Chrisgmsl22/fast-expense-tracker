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
        sharePercentage: z.coerce
            .number()
            .int("Enter a whole number")
            .min(1, "Must be at least 1%")
            .max(100, "Can't exceed 100%"),
    })
    .superRefine((val, ctx) => {
        if (val.sharesExpenses && !val.partnerName?.trim()) {
            ctx.addIssue({
                code: "custom",
                path: ["partnerName"],
                message: "Add your partner's name to share expenses",
            });
        }
    });

export type SplitRuleInput = z.infer<typeof splitRuleInputSchema>;

import { z } from "zod";

const percentField = z.preprocess(
    (val) => (val === "" || val == null ? undefined : val),
    z.coerce
        .number({ message: "Enter a whole number" })
        .int("Enter a whole number")
        .min(0, "Must be at least 0%")
        .max(100, "Can't exceed 100%"),
);

export const budgetRuleInputSchema = z
    .object({
        essentials: percentField,
        discretionary: percentField,
        savings: percentField,
    })
    .refine((v) => v.essentials + v.discretionary + v.savings === 100, {
        message: "The three buckets must add up to 100%",
    });

export type BudgetRuleInput = z.infer<typeof budgetRuleInputSchema>;

import { z } from "zod";

/**
 * Validation for the income screen (slice 2.3). Form inputs arrive as strings,
 * so the amount and date are coerced. The server action owns the CDMX→UTC date
 * conversion, exactly like expense capture (spec 0001 §3).
 */

/** A logged one-off income (the "+ Add income" form). */
export const variableIncomeInputSchema = z.object({
    source: z.string().min(1, "Source is required").max(200),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    date: z.coerce.date(),
});

export type VariableIncomeInput = z.infer<typeof variableIncomeInputSchema>;

/** The recurring monthly amount; 0 clears it. */
export const fixedIncomeInputSchema = z.object({
    amount: z.coerce.number().min(0, "Amount can't be negative"),
});

export type FixedIncomeInput = z.infer<typeof fixedIncomeInputSchema>;

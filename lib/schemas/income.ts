import { z } from "zod";

import { isValidMonth } from "@/lib/dates";
import { captureDateSchema } from "@/lib/schemas/capture-date";

/**
 * Validation for the income screen (slice 2.3). Form inputs arrive as strings,
 * so the amount and date are coerced. The server action owns the CDMX→UTC date
 * conversion, exactly like expense capture (spec 0001 §3).
 */

/** A logged one-off income (the "+ Add income" form). */
export const variableIncomeInputSchema = z.object({
    source: z.string().min(1, "Source is required").max(200),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    date: captureDateSchema,
});

export type VariableIncomeInput = z.infer<typeof variableIncomeInputSchema>;

/** The fixed monthly amount; 0 clears it. `month` is sent only to edit one past month. */
export const fixedIncomeInputSchema = z.object({
    amount: z.coerce.number().min(0, "Amount can't be negative"),
    month: z
        .string()
        .refine(isValidMonth, "Month must be YYYY-MM")
        .refine((m) => m >= "2000-01", "Month can't be before 2000")
        .optional(),
});

export type FixedIncomeInput = z.infer<typeof fixedIncomeInputSchema>;

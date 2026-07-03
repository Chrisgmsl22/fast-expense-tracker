import { z } from "zod";

/**
 * Validation for editing a category's monthly limit (ADR-0016). Form inputs
 * arrive as strings; a blank field means "no limit" (null) — for
 * `thisMonthAmount` that clears the month's override, for `defaultAmount` it
 * clears the category default. A provided amount must be positive.
 */

/**
 * Blank → null ("no limit"); otherwise a positive number. Thousands separators
 * and spaces are stripped first, so a user typing `"1,800"` for an MXN amount is
 * accepted as 1800 rather than rejected as NaN.
 */
const nullableAmount = z.preprocess((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") {
        const cleaned = v.replace(/[,\s]/g, "");
        return cleaned === "" ? null : cleaned;
    }
    return v;
}, z.coerce.number().positive("Amount must be greater than 0").nullable());

export const categoryBudgetInputSchema = z.object({
    slug: z.string().min(1, "Category is required"),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid month"),
    /** This month's override; null clears it (falls back to the default). */
    thisMonthAmount: nullableAmount,
    /** The default applied to months without an override; null = no limit. */
    defaultAmount: nullableAmount,
});

export type CategoryBudgetInput = z.infer<typeof categoryBudgetInputSchema>;

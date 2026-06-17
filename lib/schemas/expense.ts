import { z } from "zod";

/**
 * Validation for capturing an expense (slice 1.4).
 *
 * Form inputs arrive as strings, so numerics and the date are coerced. The
 * server action owns CDMX→UTC date conversion and the `actualExpenditure`
 * computation (spec 0001 §3). `paidBy` records who fronted the money — the
 * bidirectional-settlement model (spec 0003); it never nets into the stored
 * amount.
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
        paidBy: z.enum(["you", "gf"]).default("you"),
    })
    .refine((v) => !v.isShared || v.yourPercentage < 1, {
        message: "A shared expense needs your share below 100%",
        path: ["yourPercentage"],
    });

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

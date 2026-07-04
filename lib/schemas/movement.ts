import { z } from "zod";

/**
 * Validation for logging money movements (ADR-0018). Form inputs
 * arrive as strings, so the amount and date are coerced. The server action owns
 * CDMX→UTC date conversion; movements never touch the expense/consumption math.
 */

/** Card payment — always targets a card; may be funded by the partner's money. */
export const cardPaymentInputSchema = z.object({
    date: z.coerce.date(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    cardId: z.string().min(1, "Card is required"),
    fundedByPartner: z.boolean().default(false),
    note: z.string().max(1000).optional(),
});

export type CardPaymentInput = z.infer<typeof cardPaymentInputSchema>;

/** A transfer you sent the partner ("I paid {partner}") — a `gf_paid` movement. */
export const transferInputSchema = z.object({
    date: z.coerce.date(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    note: z.string().max(1000).optional(),
});

export type TransferInput = z.infer<typeof transferInputSchema>;

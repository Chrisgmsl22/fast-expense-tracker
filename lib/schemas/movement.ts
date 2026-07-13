import { z } from "zod";

/**
 * Validation for logging money movements (ADR-0018). Form inputs
 * arrive as strings, so the amount and date are coerced. The server action owns
 * CDMX→UTC date conversion; movements never touch the expense/consumption math.
 */

/** Card payment — real money moving to a card, decoupled from any expense. */
export const cardPaymentInputSchema = z.object({
    date: z.coerce.date(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    cardId: z.string().min(1, "Card is required"),
    note: z.string().max(1000).optional(),
});

export type CardPaymentInput = z.infer<typeof cardPaymentInputSchema>;

/**
 * A cash transfer between you and the partner. `direction` picks the side:
 * `gf_paid` = "I paid {partner}" (money out), `gf_received` = "{partner} paid me"
 * (money in, settling what she owes you). Defaults to `gf_paid` for back-compat
 * with the original one-directional transfer.
 */
export const transferInputSchema = z.object({
    date: z.coerce.date(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    direction: z.enum(["gf_paid", "gf_received"]).default("gf_paid"),
    note: z.string().max(1000).optional(),
});

export type TransferInput = z.infer<typeof transferInputSchema>;

/**
 * An "I owe {partner}" debt — something she fronted that you owe her back
 * (ADR-0020). Stored as a `Movement{type:"gf_fronted"}`: settlement-only, no
 * category, no card, never consumption or budget. Just amount / date / optional
 * note. Logged only from the settlement page.
 */
export const partnerDebtInputSchema = z.object({
    date: z.coerce.date(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    note: z.string().max(200).optional(),
});

export type PartnerDebtInput = z.infer<typeof partnerDebtInputSchema>;

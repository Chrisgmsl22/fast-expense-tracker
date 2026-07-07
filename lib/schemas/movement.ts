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
 * An "I owe {partner}" debt — your share of shared things she fronted (spec
 * 0004). Stored as an `Expense{paidBy:"gf"}`, so it needs a category (the debt
 * feeds "What I really spent" + its bucket). The amount is your share; the
 * action sets `actualExpenditure = amount`. Logged only from the settlement page.
 */
export const partnerDebtInputSchema = z.object({
    date: z.coerce.date(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    categoryId: z.string().min(1, "Category is required"),
    note: z.string().max(200).optional(),
});

export type PartnerDebtInput = z.infer<typeof partnerDebtInputSchema>;

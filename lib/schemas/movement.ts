import { z } from "zod";

import { TRANSFER_FUNDING_SOURCES } from "@/lib/domain/funding";

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
export const transferInputSchema = z
    .object({
        date: z.coerce.date(),
        amount: z.coerce.number().positive("Amount must be greater than 0"),
        direction: z.enum(["gf_paid", "gf_received"]).default("gf_paid"),
        note: z.string().max(1000).optional(),
        /**
         * Two values only: `reimbursed` is Health-only (§3.3) and a transfer has
         * no category. Defaulted for a caller that omits the field.
         */
        fundedFrom: z.enum(TRANSFER_FUNDING_SOURCES).default("income"),
    })
    .refine((v) => v.direction === "gf_paid" || v.fundedFrom === "income", {
        // Inbound money is funded by nothing of yours. Rejected, not rewritten:
        // a stored value nobody meant is worse than an error.
        message: "Only money you send can be funded from savings",
        path: ["fundedFrom"],
    });

export type TransferInput = z.infer<typeof transferInputSchema>;

/**
 * An "I owe {partner}" debt — something she fronted. Stored as a
 * `Movement{type:"gf_fronted"}`: settlement only, never consumption (spec 0007 §6b).
 * It is provisional; the payment that settles it is the expense.
 */
export const partnerDebtInputSchema = z.object({
    date: z.coerce.date(),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    note: z.string().max(200).optional(),
});

export type PartnerDebtInput = z.infer<typeof partnerDebtInputSchema>;

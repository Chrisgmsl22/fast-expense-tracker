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
         * Which month's money funded the transfer (spec 0007 §3.1). Two values
         * only: `reimbursed` is Health-only (§3.3) and a transfer has no
         * category, so it is rejected here whatever route it arrives by — the
         * form never offers it, and neither does anything else. Defaulted, so a
         * caller that omits the field keeps today's behaviour.
         */
        fundedFrom: z.enum(TRANSFER_FUNDING_SOURCES).default("income"),
    })
    .refine((v) => v.direction === "gf_paid" || v.fundedFrom === "income", {
        // Money coming IN from the partner is funded by nothing of yours, so a
        // funding source would be meaningless on it. Rejected rather than
        // silently rewritten: a stored value nobody meant is worse than an error.
        message: "Only money you send can be funded from savings",
        path: ["fundedFrom"],
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

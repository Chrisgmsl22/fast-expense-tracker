import { z } from "zod";

import { isValidHex } from "@/lib/palette";

/**
 * Validation for card management (spec 0006 §6). The colour accepts either a
 * palette swatch or a custom value, so the schema only enforces the `#RRGGBB`
 * shape (normalized to lowercase); the palette is a UI convenience, not an
 * allow-list. `type` is immutable after creation (the mock has no type control
 * on the edit row), so only `addCardInputSchema` carries it.
 */
export const cardTypeSchema = z.enum(["credit", "debit", "cash"]);

/**
 * The types a user may *add*. `cash` is excluded on purpose: the cash card is a
 * single system-managed, fully-locked card (null `cardId` = Cash on the
 * dashboard). Adding another `type:"cash"` card would be permanently
 * un-removable (locked by `isCash`) and break that invariant, so a cash add
 * fails validation here rather than reaching the DB.
 */
export const addCardTypeSchema = z.enum(["credit", "debit"]);

const cardNameSchema = z
    .string()
    .trim()
    .min(1, "Card name is required")
    .max(40, "Card name is too long");

const cardColorSchema = z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidHex, "Enter a valid #RRGGBB colour");

export const addCardInputSchema = z.object({
    name: cardNameSchema,
    type: addCardTypeSchema,
    color: cardColorSchema,
});

export const updateCardInputSchema = z.object({
    // A malformed id can't match another user's row (the repo scopes writes by
    // `{ id, userId }`), so this only needs to be present — mirrors the expense
    // and movement schemas rather than enforcing a strict UUID shape.
    id: z.string().min(1, "Card is required"),
    name: cardNameSchema,
    // Editable, but never TO cash: a card can't become the locked system card.
    type: addCardTypeSchema,
    color: cardColorSchema,
});

/** Identify a card for archive/delete — id only (both are `userId`-scoped). */
export const cardIdInputSchema = z.object({
    id: z.string().min(1, "Card is required"),
});

export type CardType = z.infer<typeof cardTypeSchema>;
export type AddCardInput = z.infer<typeof addCardInputSchema>;
export type UpdateCardInput = z.infer<typeof updateCardInputSchema>;
export type CardIdInput = z.infer<typeof cardIdInputSchema>;

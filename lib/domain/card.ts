/**
 * Pure card domain constants (spec 0006 §6) — no DB, no framework.
 */

/**
 * The cap on active (non-archived) cards per user, enforced in the add action.
 * Archived cards don't count — archive an old one to free a slot.
 */
export const MAX_ACTIVE_CARDS = 10;

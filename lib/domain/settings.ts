/**
 * Pure settings domain logic — no DB, no env, no framework. Covers the
 * shared-expense mode + partner identity that used to be the hardcoded
 * `PARTNER_NAME` constant (spec 0006 / ADR-0021).
 */

/** The schema default for a shared expense — the owner's 68% slice. */
export const DEFAULT_SHARE_PERCENTAGE = 0.68;

/**
 * Fallback shown wherever a partner name is interpolated but none is set (a Solo
 * account before it opts in). In Solo mode these surfaces are hidden entirely
 * (CHORE-6.b), so this only ever shows on the brief window between opting in and
 * naming the partner — never "undefined" in the UI.
 */
export const SOLO_PARTNER_FALLBACK = "your partner";

/** The user's settings, resolved to non-optional values the app reads. */
export type UserSettings = {
    /** Opt-in shared-expense mode. Default false (Solo). */
    sharesExpenses: boolean;
    /** Stored partner name; null in Solo mode. */
    partnerName: string | null;
    /** Your share of a shared expense, as a fraction (0.68 = 68%). */
    defaultSharePercentage: number;
};

/** The stored columns this domain reads from a `Settings` row. */
type SettingsRow = {
    sharesExpenses: boolean;
    partnerName: string | null;
    defaultSharePercentage: number;
};

/**
 * Map a nullable `Settings` row to `UserSettings`, applying Solo defaults when
 * the user has no row yet. The single place the "missing settings" fallback
 * lives, so every accessor caller sees the same defaults.
 */
export function toUserSettings(row: SettingsRow | null): UserSettings {
    return {
        sharesExpenses: row?.sharesExpenses ?? false,
        partnerName: row?.partnerName ?? null,
        defaultSharePercentage:
            row?.defaultSharePercentage ?? DEFAULT_SHARE_PERCENTAGE,
    };
}

/**
 * The display name to interpolate into partner-facing strings. Falls back to a
 * neutral label so a name is never blank/"undefined" in the UI.
 */
export function resolvePartnerName(name: string | null | undefined): string {
    const trimmed = name?.trim();
    return trimmed ? trimmed : SOLO_PARTNER_FALLBACK;
}

/** The fields the split-rule action persists to `Settings`. */
export type SplitRulePersist = {
    sharesExpenses: boolean;
    partnerName: string | null;
    defaultSharePercentage: number;
};

/**
 * Normalize validated split-rule form input into the columns to store. The
 * partner name is preserved regardless of mode (only nulled when genuinely
 * blank), so toggling Shared→Solo is lossless: disabling sharing hides the
 * partner surfaces (CHORE-6.b) but never deletes the name, and re-enabling
 * restores it (ADR-0021). The share percentage is stored as a fraction; when
 * absent (a Solo save omits it) it falls back to `DEFAULT_SHARE_PERCENTAGE`.
 * Assumes the input already passed `splitRuleInputSchema` (which requires a name
 * and share when `sharesExpenses` is on).
 */
export function resolveSplitRule(input: {
    sharesExpenses: boolean;
    partnerName?: string;
    sharePercentage?: number;
}): SplitRulePersist {
    return {
        sharesExpenses: input.sharesExpenses,
        partnerName: input.partnerName?.trim() || null,
        defaultSharePercentage:
            input.sharePercentage === undefined
                ? DEFAULT_SHARE_PERCENTAGE
                : input.sharePercentage / 100,
    };
}

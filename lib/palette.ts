/**
 * The single source of truth for card colours (spec 0006 §6). Before this module
 * the seed card hexes, the login-page card dots, and three inline `CASH_COLOR`
 * constants had all drifted apart; the card swatch picker + those consumers now
 * import from here. Hex values match the seed exactly so existing card rows are
 * unchanged. Source: docs/reference/domain-reference.md §4.
 */

/** One named swatch offered in the card colour picker. */
export type PaletteSwatch = {
    name: string;
    hex: string;
};

/** The locked green every cash surface uses; the Cash card can't recolor off it. */
export const CASH_COLOR = "#16a34a";

/**
 * The named swatch grid for the card colour picker — the five seeded card
 * colours plus a few extras so newly-added cards have a spread to choose from.
 * A validated custom `#RRGGBB` hex is also allowed (card schema), so this is a
 * convenience set, not an exhaustive allow-list.
 */
export const CARD_PALETTE: readonly PaletteSwatch[] = [
    { name: "Slate", hex: "#6b7280" },
    { name: "Gold", hex: "#ca8a04" },
    { name: "Purple", hex: "#9333ea" },
    { name: "Blue", hex: "#2563eb" },
    { name: "Green", hex: CASH_COLOR },
    { name: "Red", hex: "#dc2626" },
    { name: "Teal", hex: "#0d9488" },
    { name: "Pink", hex: "#db2777" },
    { name: "Amber", hex: "#d97706" },
    { name: "Indigo", hex: "#4f46e5" },
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** True when `value` is a 6-digit `#RRGGBB` hex colour. */
export function isValidHex(value: string): boolean {
    return HEX_PATTERN.test(value);
}

/** Trim surrounding whitespace and lowercase a hex string for storage/compare. */
export function normalizeHex(value: string): string {
    return value.trim().toLowerCase();
}

/** True when `value` is one of the named palette swatches (normalized compare). */
export function isPaletteColor(value: string): boolean {
    const normalized = normalizeHex(value);
    return CARD_PALETTE.some((swatch) => swatch.hex === normalized);
}

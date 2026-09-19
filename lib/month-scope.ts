/**
 * The month a month-scoped screen shows: `?month=`, then the remembered month, then
 * the current CDMX month. The store is a COOKIE, not client state — these are server
 * components, and `localStorage` would flash the wrong month first.
 */

import { getCurrentMonthCdmx, isValidMonth } from "@/lib/dates";

/**
 * Session cookie — deliberately no `Max-Age`. A month choice that outlived the
 * browser would leave the app on September next week with nothing explaining why.
 */
export const MONTH_COOKIE = "fet_scoped_month";

export type MonthSources = {
    param?: string | null;
    stored?: string | null;
    /** Injectable clock, so the "neither" branch is testable. */
    now?: Date;
};

/**
 * Pure resolution of the three sources. The cookie is user-editable, so anything
 * malformed is ignored rather than trusted.
 */
export function resolveMonth({ param, stored, now }: MonthSources): string {
    if (param && isValidMonth(param)) return param;
    if (stored && isValidMonth(stored)) return stored;
    return getCurrentMonthCdmx(now ?? new Date());
}

/**
 * The `document.cookie` string that remembers a month, or null for anything that is
 * not one: the value is interpolated into a cookie, so it is checked where it is
 * WRITTEN, not only where it is read back. `SameSite=Lax` — a preference, not a credential.
 */
export function monthCookieString(month: string): string | null {
    if (!isValidMonth(month)) return null;
    return `${MONTH_COOKIE}=${month}; path=/; SameSite=Lax`;
}

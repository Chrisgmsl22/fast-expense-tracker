/**
 * The month a month-scoped screen should show, and where that choice is kept.
 *
 * Resolution order (one rule, shared by every screen that adopts it):
 *
 *   1. the `?month=` URL parameter — a link stays linkable and a refresh faithful;
 *   2. the remembered month — what makes the choice survive navigation;
 *   3. the current CDMX month.
 *
 * The store is a **cookie** rather than client state: these pages are server
 * components that read `searchParams`, so the value has to be readable during
 * the server render. `localStorage` would paint the current month first and
 * correct itself afterwards, which is a visible flash of the wrong data.
 *
 * Settlement is the first screen to use this; Dashboard and Expenses adopt it
 * in a later slice without changing this module.
 */

import { getCurrentMonthCdmx, isValidMonth } from "@/lib/dates";

/**
 * Session cookie — deliberately no `Max-Age`. A month choice that outlived the
 * browser would mean opening the app next week still looking at September with
 * nothing on screen explaining why. It survives navigation, not the session.
 */
export const MONTH_COOKIE = "fet_scoped_month";

export type MonthSources = {
    /** `?month=` from the URL, if present. */
    param?: string | null;
    /** The remembered month, from the cookie. */
    stored?: string | null;
    /** Injectable clock, so the "neither" branch is testable. */
    now?: Date;
};

/**
 * Pure resolution of the three sources. Anything malformed is ignored rather
 * than trusted — the cookie is user-editable, so it is validated like input.
 */
export function resolveMonth({ param, stored, now }: MonthSources): string {
    if (param && isValidMonth(param)) return param;
    if (stored && isValidMonth(stored)) return stored;
    return getCurrentMonthCdmx(now ?? new Date());
}

/**
 * The `document.cookie` string that remembers a month. Written by the month
 * picker at the same moment it pushes the URL, so the two can never disagree.
 * `SameSite=Lax` because this is a navigation preference, not a credential.
 */
export function monthCookieString(month: string): string {
    return `${MONTH_COOKIE}=${month}; path=/; SameSite=Lax`;
}

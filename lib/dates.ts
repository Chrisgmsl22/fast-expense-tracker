// CDMX is UTC-6 year-round (no DST) — spec 0001 §Time and dates. Capture stores
// a calendar day as that day's CDMX local midnight in UTC (06:00Z), so all month
// math here uses the same offset to keep rows in the month the user picked.
const CDMX_UTC_OFFSET_HOURS = 6;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(value: string): boolean {
    return MONTH_PATTERN.test(value);
}

/**
 * Half-open UTC range `[start, end)` for a `YYYY-MM` month. Callers validate the
 * string with `isValidMonth` first.
 */
export function getMonthRangeUtc(month: string): { start: Date; end: Date } {
    const year = Number(month.slice(0, 4));
    const monthIndex = Number(month.slice(5, 7)) - 1;
    return {
        start: new Date(Date.UTC(year, monthIndex, 1, CDMX_UTC_OFFSET_HOURS)),
        end: new Date(Date.UTC(year, monthIndex + 1, 1, CDMX_UTC_OFFSET_HOURS)),
    };
}

/**
 * Current month as `YYYY-MM` in CDMX wall-clock time. `now` is injectable so the
 * UTC-6 boundary (when a UTC day has rolled over but CDMX hasn't) is testable.
 */
export function getCurrentMonthCdmx(now: Date = new Date()): string {
    const cdmx = new Date(
        now.getTime() - CDMX_UTC_OFFSET_HOURS * 60 * 60 * 1000,
    );
    const year = cdmx.getUTCFullYear();
    const month = String(cdmx.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}

/**
 * A calendar date → the UTC instant of that day's CDMX local midnight (06:00Z).
 * Capture and edit store dates this way so month-boundary
 * queries land in the month the user picked. Reads the date's UTC fields, which
 * carry the calendar day for a `type="date"` value parsed as UTC.
 */
export function cdmxCalendarDateToUtc(date: Date): Date {
    return new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            CDMX_UTC_OFFSET_HOURS,
        ),
    );
}

/**
 * A `Date` → the `yyyy-mm-dd` a `type="date"` input expects, read in UTC — the
 * same frame capture/edit store dates in (see `cdmxCalendarDateToUtc`), so the
 * round-trip is lossless.
 */
export function toDateInputValue(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** `YYYY-MM` shifted by `delta` months, with year rollover. */
export function shiftMonth(month: string, delta: number): string {
    const year = Number(month.slice(0, 4));
    const monthIndex = Number(month.slice(5, 7)) - 1 + delta;
    const shifted = new Date(Date.UTC(year, monthIndex, 1));
    const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    return `${shifted.getUTCFullYear()}-${shiftedMonth}`;
}

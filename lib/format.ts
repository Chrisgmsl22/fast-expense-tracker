import type { Locale } from "@/i18n/config";

// Money is MXN, so it keeps the Mexican format in every locale.
const mxnFormatter = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
});

export function formatMxn(amount: number): string {
    return mxnFormatter.format(amount);
}

/** A card that owes you reads "+$1,889.25"; anything else reads as the plain amount. */
export function formatBalance(balance: number): string {
    return balance < 0
        ? `+${formatMxn(Math.abs(balance))}`
        : formatMxn(balance);
}

/** "$18.4k", "$250.50": a short, unsigned magnitude, exact to the centavo below 1,000 so a breakdown adds up. */
export function formatMxnCompactAbs(amount: number): string {
    const abs = Math.abs(amount);
    if (Math.round(abs) < 1000) return formatMxn(abs);
    return `$${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

const mxnWholeFormatter = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
});

/** Whole pesos, for a figure that must fit a small space — a donut's centre. */
export function formatMxnWhole(amount: number): string {
    return mxnWholeFormatter.format(amount);
}

const INTL_TAG = { es: "es-MX", en: "en" } as const satisfies Record<
    Locale,
    string
>;

function dateFormatters(
    options: Intl.DateTimeFormatOptions,
): Record<Locale, Intl.DateTimeFormat> {
    return {
        es: new Intl.DateTimeFormat(INTL_TAG.es, options),
        en: new Intl.DateTimeFormat(INTL_TAG.en, options),
    };
}

// Stored dates are a CDMX calendar day as 06:00Z (see lib/dates). Formatting in
// UTC recovers that calendar date instead of shifting it back a day in CDMX.
const dateFormatter = dateFormatters({
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
});

/** "15 may 2026" in Spanish, "May 15, 2026" in English. */
export function formatExpenseDate(date: Date, locale: Locale): string {
    return dateFormatter[locale].format(date);
}

const monthFormatter = dateFormatters({
    month: "long",
    year: "numeric",
    timeZone: "UTC",
});

/** "2026-06" → "junio de 2026" / "June 2026" (UTC: a calendar month, not a timestamp to shift). */
export function formatMonthLabel(month: string, locale: Locale): string {
    return monthFormatter[locale].format(new Date(`${month}-01T12:00:00Z`));
}

const monthNameFormatter = dateFormatters({
    month: "long",
    timeZone: "UTC",
});

/** "2026-06" → "junio" / "June": the month alone, for labels beside a month picker. */
export function formatMonthName(month: string, locale: Locale): string {
    return monthNameFormatter[locale].format(new Date(`${month}-01T12:00:00Z`));
}

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

/** "$18.4k", "$270": a short figure for a one-line breakdown on a narrow screen. */
export function formatMxnCompact(amount: number): string {
    const abs = Math.abs(amount);
    if (Math.round(abs) < 1000) return `$${abs.toFixed(0)}`;
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

// Stored dates are a CDMX calendar day as 06:00Z (see lib/dates). Formatting in
// UTC recovers that calendar date instead of shifting it back a day in CDMX.
const dateFormatter = new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
});

export function formatExpenseDate(date: Date): string {
    return dateFormatter.format(date);
}

const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
});

/** "2026-06" → "June 2026" (UTC: a calendar month, not a timestamp to shift). */
export function formatMonthLabel(month: string): string {
    return monthFormatter.format(new Date(`${month}-01T12:00:00Z`));
}

const monthNameFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
});

/** "2026-06" → "June": the month alone, for labels beside a month picker. */
export function formatMonthName(month: string): string {
    return monthNameFormatter.format(new Date(`${month}-01T12:00:00Z`));
}

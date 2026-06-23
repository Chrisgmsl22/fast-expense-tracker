const mxnFormatter = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
});

export function formatMxn(amount: number): string {
    return mxnFormatter.format(amount);
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

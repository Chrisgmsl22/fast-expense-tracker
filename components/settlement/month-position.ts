/** Where the viewed month sits relative to today. */
export type MonthPosition = "past" | "current" | "future";

/** Both args are `YYYY-MM`, so plain string order places one against the other. */
export function toMonthPosition(
    month: string,
    currentMonth: string,
): MonthPosition {
    if (month === currentMonth) return "current";
    return month < currentMonth ? "past" : "future";
}

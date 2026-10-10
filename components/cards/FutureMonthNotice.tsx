import { CalendarClock } from "lucide-react";

type Props = {
    /** "November": the month on screen, which has not happened yet. */
    monthName: string;
    /** "October": the month that holds the real balances. */
    currentMonthName: string;
};

/**
 * Stands in for every figure on a month later than the render's clock. Such a
 * month has no rows, so each card would carry the previous month's closing
 * balance forward and print it in the same type as a real one. It only holds if
 * nothing is charged and nothing is paid between now and then, so it is refused.
 */
export function FutureMonthNotice({ monthName, currentMonthName }: Props) {
    return (
        <section
            aria-label="Future month"
            className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed bg-card px-6 py-12 text-center"
        >
            <CalendarClock
                aria-hidden
                className="size-8 text-muted-foreground"
            />
            <p className="font-semibold">{monthName} has not happened yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
                Nothing has been charged or paid in {monthName}, so there is no
                balance to show. Go back to {currentMonthName} for your real
                card balances.
            </p>
        </section>
    );
}

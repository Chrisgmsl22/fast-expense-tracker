"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { shiftMonth } from "@/lib/dates";
import { monthCookieString } from "@/lib/month-scope";

export function MonthPicker({
    month,
    remember = false,
    rememberFuture = true,
    currentMonth,
}: {
    month: string;
    /** Also remember the choice (`lib/month-scope.ts`), so it survives navigation. */
    remember?: boolean;
    /**
     * Whether a month after `currentMonth` is remembered as well. On by default, so
     * every existing caller keeps the behaviour it has. `/cards` turns it off: a
     * month that has not happened is a URL-only state there, so stepping forward
     * never leaves the other month-scoped pages parked in the future.
     */
    rememberFuture?: boolean;
    /**
     * The live month, supplied by the server so the control never disagrees with the
     * render's clock. When it differs from `month`, a back-to-current button appears.
     */
    currentMonth?: string;
}) {
    const router = useRouter();
    // Stay on the current route (e.g. /expenses or /income) — only the month
    // query param changes, so the same control drives every month-scoped page.
    const pathname = usePathname();

    function go(next: string) {
        // The helper refuses anything that is not a month, so the store and the
        // URL are written together only for a value both can hold.
        const cookie = monthCookieString(next);
        if (!cookie) return;
        // `YYYY-MM` sorts lexicographically, so one comparison against the
        // render's clock tells a future month from the rest.
        const isFuture = currentMonth !== undefined && next > currentMonth;
        if (remember && (rememberFuture || !isFuture)) document.cookie = cookie;
        router.push(`${pathname}?month=${encodeURIComponent(next)}`);
    }

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        if (event.target.value) {
            go(event.target.value);
        }
    }

    return (
        // Wraps so the back-to-current button drops to its own line at 390px
        // instead of pushing the arrows off screen.
        <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button
                variant="outline"
                size="icon-sm"
                onClick={() => go(shiftMonth(month, -1))}
                aria-label="Previous month"
            >
                <ChevronLeft />
            </Button>
            <input
                type="month"
                value={month}
                onChange={handleChange}
                aria-label="Filter by month"
                // text-base on mobile so iOS Safari doesn't auto-zoom on focus.
                className="rounded border p-1.5 text-base sm:text-sm"
            />
            <Button
                variant="outline"
                size="icon-sm"
                onClick={() => go(shiftMonth(month, 1))}
                aria-label="Next month"
            >
                <ChevronRight />
            </Button>
            {currentMonth && currentMonth !== month && (
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => go(currentMonth)}
                >
                    Take me back to the current month
                </Button>
            )}
        </div>
    );
}

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { shiftMonth } from "@/lib/dates";

export function MonthPicker({ month }: { month: string }) {
    const router = useRouter();
    // Stay on the current route (e.g. /expenses or /income) — only the month
    // query param changes, so the same control drives every month-scoped page.
    const pathname = usePathname();

    function go(next: string) {
        router.push(`${pathname}?month=${next}`);
    }

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        if (event.target.value) {
            go(event.target.value);
        }
    }

    return (
        <div className="flex items-center gap-2 text-sm">
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
        </div>
    );
}

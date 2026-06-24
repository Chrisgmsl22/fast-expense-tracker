"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { shiftMonth } from "@/lib/dates";

export function MonthPicker({ month }: { month: string }) {
    const router = useRouter();

    function go(next: string) {
        router.push(`/expenses?month=${next}`);
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
                className="rounded border p-1.5"
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

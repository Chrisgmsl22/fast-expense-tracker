"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";

export function MonthPicker({ month }: { month: string }) {
    const router = useRouter();

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const next = event.target.value;
        if (next) {
            router.push(`/expenses?month=${next}`);
        }
    }

    return (
        <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">Month</span>
            <input
                type="month"
                value={month}
                onChange={handleChange}
                aria-label="Filter by month"
                className="rounded border p-1.5"
            />
        </label>
    );
}

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { balanceTone } from "@/components/settlement/balance-display";
import type { CoupleBalance } from "@/lib/domain/settlement";
import { formatMxn } from "@/lib/format";

/**
 * The running couple-balance chip in the month-feed footer — colour-coded status
 * that links to `/settlement` (spec 0004 §3.2). It shows the rolling
 * current+previous-month balance, so it's the same figure regardless of the
 * month the dashboard is viewing (hence "running balance", not a month total).
 */
export function SettlementChip({
    balance,
    partnerName,
    variant = "pill",
}: {
    balance: CoupleBalance;
    partnerName: string;
    variant?: "pill" | "band";
}) {
    const tone = balanceTone(balance.direction, partnerName);
    const settled = balance.direction === "settled";

    return (
        <Link
            href="/settlement"
            className={`flex items-center gap-2 px-4 py-2.5 transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring ${variant === "band" ? "border-b" : "rounded-lg border"} ${tone.tintClass} ${tone.borderClass}`}
        >
            <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${tone.dotClass}`}
            />
            <span className={`text-sm font-medium ${tone.textClass}`}>
                {tone.chipLabel}
            </span>
            {!settled && (
                <span
                    className={`ml-auto text-sm font-semibold tabular-nums ${tone.textClass}`}
                >
                    {formatMxn(balance.amount)}
                </span>
            )}
            <ChevronRight
                aria-hidden
                className={`size-4 ${settled ? "ml-auto" : ""} text-muted-foreground`}
            />
        </Link>
    );
}

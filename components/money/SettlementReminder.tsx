import type { CoupleBalance } from "@/lib/domain/settlement";
import { SettlementChip } from "@/components/dashboard/SettlementChip";

/**
 * The one unsettled-balance treatment (CHORE-19). It owns its visibility AND its
 * wrapper, so no caller repeats the solo guard or leaves an empty box. The balance
 * is the OPEN cycle's, so on any month but the live one it says so (spec 0007 §3.5).
 */
export function SettlementReminder({
    settlement,
    partnerName,
    sharesExpenses,
    isCurrentMonth,
    monthLabel,
    className = "",
    variant = "pill",
}: {
    settlement?: CoupleBalance;
    partnerName: string;
    /** Solo mode has nobody to settle with, so nothing renders. */
    sharesExpenses: boolean;
    isCurrentMonth: boolean;
    monthLabel: string;
    className?: string;
    variant?: "pill" | "band";
}) {
    if (!sharesExpenses || !settlement) return null;
    return (
        <div className={className}>
            <SettlementChip
                balance={settlement}
                partnerName={partnerName}
                variant={variant}
            />
            {isCurrentMonth && variant === "band" && (
                <p className="border-b px-4 py-1 text-[10px] text-muted-foreground">
                    Open settlement cycle · independent of filters
                </p>
            )}
            {!isCurrentMonth && (
                <p
                    className={
                        variant === "band"
                            ? "border-b px-4 py-1 text-[10px] text-muted-foreground"
                            : "mt-1 text-xs text-muted-foreground"
                    }
                >
                    The open settlement — not {monthLabel}.
                </p>
            )}
        </div>
    );
}

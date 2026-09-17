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
}: {
    settlement?: CoupleBalance;
    partnerName: string;
    /** Solo mode has nobody to settle with, so nothing renders. */
    sharesExpenses: boolean;
    isCurrentMonth: boolean;
    monthLabel: string;
    className?: string;
}) {
    if (!sharesExpenses || !settlement) return null;
    return (
        <div className={className}>
            <SettlementChip balance={settlement} partnerName={partnerName} />
            {!isCurrentMonth && (
                <p className="mt-1 text-xs text-muted-foreground">
                    The open settlement — not {monthLabel}.
                </p>
            )}
        </div>
    );
}

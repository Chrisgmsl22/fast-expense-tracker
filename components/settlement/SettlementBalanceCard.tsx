import { Check } from "lucide-react";

import type { CoupleBalance } from "@/lib/domain/settlement";
import { formatMxn } from "@/lib/format";
import { PARTNER_NAME } from "@/lib/partner";
import { balanceTone } from "./balance-display";

/**
 * The settlement hero (spec 0004 §3.1) — direction dot + label, the big amount,
 * a two-sided `you owe ←→ she owes` bar, and a "from last month" note when
 * previous-month debt is carried in. Settled shows a check and an empty bar.
 */
export function SettlementBalanceCard({
    balance,
    carriedOver,
}: {
    balance: CoupleBalance;
    carriedOver: { present: boolean; amount: number };
}) {
    const tone = balanceTone(balance.direction);
    const settled = balance.direction === "settled";

    return (
        <div className={`rounded-xl border p-6 ${tone.tintClass}`}>
            {settled ? (
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-positive-tint text-positive">
                        <Check className="size-6" />
                    </span>
                    <p className="text-xl font-bold">All settled</p>
                    <p className="text-sm text-muted-foreground">
                        Nobody owes anything.
                    </p>
                </div>
            ) : (
                <>
                    <p
                        className={`flex items-center gap-2 text-xs font-semibold tracking-wide ${tone.textClass}`}
                    >
                        <span
                            aria-hidden
                            className={`size-2 rounded-full ${tone.dotClass}`}
                        />
                        {tone.label}
                    </p>
                    <p className="mt-1 text-4xl font-bold tabular-nums">
                        {formatMxn(balance.amount)}
                        <span className="ml-2 align-top text-sm font-medium text-muted-foreground">
                            MXN
                        </span>
                    </p>
                    {carriedOver.present && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            includes {formatMxn(carriedOver.amount)} from last
                            month
                        </p>
                    )}
                </>
            )}

            <BalanceBar
                direction={balance.direction}
                fillClass={tone.fillClass}
            />
        </div>
    );
}

/**
 * A directional accent: an empty track with the fill on the owing half. The
 * exact amount is the big number above; the bar just shows which way it leans.
 */
function BalanceBar({
    direction,
    fillClass,
}: {
    direction: CoupleBalance["direction"];
    fillClass: string;
}) {
    return (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <span>you owe</span>
            <div className="relative h-2 flex-1 rounded-full bg-black/5 dark:bg-white/10">
                {direction === "she_owes" && (
                    <span
                        className={`absolute top-0 left-1/2 h-2 w-[42%] rounded-full ${fillClass}`}
                    />
                )}
                {direction === "you_owe" && (
                    <span
                        className={`absolute top-0 right-1/2 h-2 w-[42%] rounded-full ${fillClass}`}
                    />
                )}
                <span
                    aria-hidden
                    className="absolute top-1/2 left-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-border"
                />
            </div>
            <span>{`${PARTNER_NAME.toLowerCase()} owes`}</span>
        </div>
    );
}

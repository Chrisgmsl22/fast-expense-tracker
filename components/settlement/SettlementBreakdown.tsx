import type {
    CoupleBalance,
    SettlementBreakdownKey,
} from "@/lib/domain/settlement";
import { formatMxn } from "@/lib/format";
import { PARTNER_NAME } from "@/lib/partner";
import { balanceTone } from "./balance-display";

const LABELS: Record<SettlementBreakdownKey, string> = {
    partner_share: `${PARTNER_NAME}'s 32% of shared expenses you logged`,
    your_debt: `Debts you logged as "I owe ${PARTNER_NAME}"`,
    partner_paid: `Money ${PARTNER_NAME} paid you`,
    you_paid: `Money you paid ${PARTNER_NAME}`,
};

const SUBLABELS: Partial<Record<SettlementBreakdownKey, string>> = {
    partner_paid: "transfers she sent you",
};

// Money lines carry the journal's colour language: green = she paid you,
// gold = you paid her, orange = a debt you owe (matches the journal key).
const AMOUNT_CLASS: Record<SettlementBreakdownKey, string> = {
    partner_share: "text-positive",
    your_debt: "text-debt",
    partner_paid: "text-positive",
    you_paid: "text-transfer",
};

/** "How this balance is made" — the four signed lines + the net (spec 0004 §3.1). */
export function SettlementBreakdown({ balance }: { balance: CoupleBalance }) {
    const tone = balanceTone(balance.direction);
    const netLabel =
        balance.direction === "settled"
            ? "Settled"
            : `${tone.chipLabel} ${formatMxn(balance.amount)}`;

    return (
        <div className="rounded-xl border p-5">
            <p className="font-semibold">How this balance is made</p>
            <ul className="mt-3 space-y-2 text-sm">
                {balance.breakdown.map((line) => (
                    <li
                        key={line.key}
                        className="flex items-center justify-between gap-3"
                    >
                        <span>
                            {LABELS[line.key]}
                            {SUBLABELS[line.key] ? (
                                <span className="text-muted-foreground">
                                    {" "}
                                    ({SUBLABELS[line.key]})
                                </span>
                            ) : null}
                        </span>
                        <span
                            className={`shrink-0 font-semibold tabular-nums ${AMOUNT_CLASS[line.key]}`}
                        >
                            {line.sign === "-" ? "−" : "+"}
                            {formatMxn(line.amount)}
                        </span>
                    </li>
                ))}
            </ul>
            {/* Net balance as a dark band flush to the card edges — the same
                high-contrast treatment as the expenses totals bar, so the
                bottom line is the easiest thing to spot. */}
            <div className="-mx-5 -mb-5 mt-4 flex items-center justify-between rounded-b-xl bg-foreground px-5 py-3 text-sm text-background">
                <span className="font-medium">Net balance</span>
                <span className="font-bold tabular-nums">{netLabel}</span>
            </div>
        </div>
    );
}

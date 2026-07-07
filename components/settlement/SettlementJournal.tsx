import { ArrowLeftRight, BarChart3, Check } from "lucide-react";

import { formatExpenseDate, formatMxn } from "@/lib/format";
import { PARTNER_NAME } from "@/lib/partner";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";

/**
 * The settlement movement journal (spec 0004 §3.1) — shared expenses you paid
 * (+ her 32%), "I owe {partner}" debts (− your share), and transfers, newest
 * first. Previous-month rows sit under an "Earlier months" divider so carried
 * debt is obvious.
 */
export function SettlementJournal({
    journal,
}: {
    journal: SettlementJournalItem[];
}) {
    if (journal.length === 0) {
        return (
            <div className="rounded-xl border p-5">
                <p className="font-semibold">Movement journal</p>
                <p className="mt-3 text-sm text-muted-foreground">
                    Nothing to settle yet.
                </p>
            </div>
        );
    }

    // The service sorts newest-first, so all current-month rows precede the
    // carried-over ones; the divider goes before the first carried row.
    const firstCarriedId = journal.find((j) => j.carriedOver)?.id;

    return (
        <div className="rounded-xl border p-5">
            <div className="flex items-baseline justify-between">
                <p className="font-semibold">Movement journal</p>
                <p className="text-xs text-muted-foreground">
                    shared expenses · debts · transfers
                </p>
            </div>
            <ul className="mt-3 divide-y">
                {journal.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                        {item.id === firstCarriedId && (
                            <p className="py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                Earlier months
                            </p>
                        )}
                        <JournalRow item={item} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function JournalRow({ item }: { item: SettlementJournalItem }) {
    if (item.kind === "your_expense") {
        return (
            <Row
                icon={<Check className="size-4" />}
                iconClass="bg-positive-tint text-positive"
                title={item.description}
                subtitle={`${formatExpenseDate(item.date)} · you paid ${formatMxn(item.gross)} · ${PARTNER_NAME}'s 32%`}
                amount={`+${formatMxn(item.partnerShare)}`}
                amountClass="text-positive"
            />
        );
    }
    if (item.kind === "partner_debt") {
        return (
            <Row
                icon={<BarChart3 className="size-4" />}
                iconClass="bg-transfer-tint text-transfer"
                title={item.description}
                subtitle={`${formatExpenseDate(item.date)} · un-itemized`}
                amount={`−${formatMxn(item.amount)}`}
                amountClass="text-transfer"
            />
        );
    }
    const inbound = item.direction === "gf_received";
    return (
        <Row
            icon={<ArrowLeftRight className="size-4" />}
            iconClass={
                inbound
                    ? "bg-positive-tint text-positive"
                    : "bg-transfer-tint text-transfer"
            }
            title={
                inbound
                    ? `Transfer — ${PARTNER_NAME} paid you`
                    : `Transfer — you paid ${PARTNER_NAME}`
            }
            subtitle={formatExpenseDate(item.date)}
            amount={formatMxn(item.amount)}
            amountClass={inbound ? "text-positive" : "text-transfer"}
        />
    );
}

function Row({
    icon,
    iconClass,
    title,
    subtitle,
    amount,
    amountClass,
}: {
    icon: React.ReactNode;
    iconClass: string;
    title: string;
    subtitle: string;
    amount: string;
    amountClass: string;
}) {
    return (
        <div className="flex items-center gap-3 py-2.5">
            <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-md ${iconClass}`}
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                    {title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                    {subtitle}
                </span>
            </span>
            <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${amountClass}`}
            >
                {amount}
            </span>
        </div>
    );
}

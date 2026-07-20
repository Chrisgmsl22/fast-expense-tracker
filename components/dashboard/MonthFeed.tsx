import { SAVINGS_SLUG } from "@/lib/domain/dashboard";
import { computeFeedTotals, type MovementType } from "@/lib/domain/movement";
import type { CoupleBalance } from "@/lib/domain/settlement";
import { buildFeed } from "@/lib/feed";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";
import type { MovementListItem } from "@/lib/repositories/movement.repository";
import { CASH_COLOR } from "@/lib/palette";
import { movementDisplay } from "@/components/movement/movement-display";
import { SettlementChip } from "./SettlementChip";

/**
 * Right-rail month feed — a read-only list of the month's expenses **and money
 * movements** (card payments, transfers to the partner), newest first, with a
 * pinned footer. Movements are colour-tagged (card payment blue, "I paid
 * {partner}" gold) and never enter the spend total. The footer splits money into
 * Charged / What I really spent (consumption) / Set aside (savings) / Paid to
 * {partner} / Total. Who-owes-whom lives in the settlement slice, not here
 * (ADR-0018).
 */
export function MonthFeed({
    expenses,
    movements,
    monthLabel,
    settlement,
    partnerName,
    sharesExpenses,
}: {
    expenses: ExpenseListItem[];
    movements: MovementListItem[];
    monthLabel: string;
    /** Running couple balance — rendered as a chip in the footer (spec 0004). */
    settlement?: CoupleBalance;
    partnerName: string;
    /**
     * Shared-expense mode. Solo hides only the settlement chip on the dashboard
     * — the running couple balance stays live and settleable via `/settlement`
     * while unsettled (ADR-0021, decision 8; nothing is frozen). Historical
     * partner rows and the monthly "Paid to {partner}" total stay visible: a
     * was-shared user keeps their real history, and a genuine solo user has
     * none, so the feed still reads as a plain tracker (Option 2). Partner
     * movements are never rewritten (ADR-0021), just no longer created in solo.
     */
    sharesExpenses: boolean;
}) {
    const feed = buildFeed(expenses, movements);

    const paidToPartner = sumByType(movements, "gf_paid");
    const totals = computeFeedTotals(expenses, paidToPartner);

    const count = feed.length;

    return (
        <div className="flex max-h-[70vh] flex-col rounded-lg border lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)]">
            <div className="border-b p-4">
                <p className="text-sm font-medium">
                    All activity · {monthLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                    {count} {count === 1 ? "entry" : "entries"}
                    {count > 0 ? " · scroll" : ""}
                </p>
            </div>

            {count === 0 ? (
                <p className="flex-1 p-8 text-center text-sm text-muted-foreground">
                    Nothing logged this month yet.
                </p>
            ) : (
                <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
                    {feed.map((item) =>
                        item.kind === "expense" ? (
                            <ExpenseRow
                                key={`e-${item.expense.id}`}
                                expense={item.expense}
                            />
                        ) : (
                            <MovementRow
                                key={`m-${item.movement.id}`}
                                movement={item.movement}
                                partnerName={partnerName}
                            />
                        ),
                    )}
                </ul>
            )}

            {count > 0 && (
                <div
                    data-testid="feed-totals"
                    className="space-y-1.5 border-t p-4 text-sm"
                >
                    {sharesExpenses && settlement && (
                        <div className="pb-1">
                            <SettlementChip
                                balance={settlement}
                                partnerName={partnerName}
                            />
                        </div>
                    )}
                    {/* Every amount carries the same px-2 + tabular-nums so the
                        digits line up in one right-aligned column — even the
                        "spent" pill and the Total band (which bleeds to the card
                        edges but re-insets its content to match). */}
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                            Charged
                        </span>
                        <span className="px-2 font-semibold text-foreground tabular-nums">
                            {formatMxn(totals.charged)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                            What I really spent
                        </span>
                        <span className="rounded-full bg-spent-tint px-2 py-0.5 font-semibold text-spent tabular-nums">
                            {formatMxn(totals.whatIReallySpent)}
                        </span>
                    </div>
                    {totals.setAside > 0 && (
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">
                                Set aside
                            </span>
                            <span className="px-2 font-semibold text-bucket-savings tabular-nums">
                                {formatMxn(totals.setAside)}
                            </span>
                        </div>
                    )}
                    {totals.paidToPartner > 0 && (
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">
                                Paid to {partnerName}
                            </span>
                            <span className="px-2 font-semibold text-transfer tabular-nums">
                                {formatMxn(totals.paidToPartner)}
                            </span>
                        </div>
                    )}
                    {/* Total only when it says something beyond "what I really
                        spent" — i.e. savings or a transfer added to it. Dark band
                        (flush to the card bottom) so it's easy to spot. */}
                    {(totals.setAside > 0 || totals.paidToPartner > 0) && (
                        <div className="-mx-4 -mb-4 mt-1 flex items-center justify-between rounded-b-lg bg-foreground px-4 py-2.5 text-background">
                            <span className="font-medium">Total</span>
                            <span className="px-2 font-semibold tabular-nums">
                                {formatMxn(totals.total)}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {count === 0 && sharesExpenses && settlement && (
                <div className="border-t p-4">
                    <SettlementChip
                        balance={settlement}
                        partnerName={partnerName}
                    />
                </div>
            )}
        </div>
    );
}

function sumByType(movements: MovementListItem[], type: MovementType): number {
    return movements
        .filter((m) => m.type === type)
        .reduce((sum, m) => sum + m.amount, 0);
}

/** One expense line (neutral). */
function ExpenseRow({ expense: e }: { expense: ExpenseListItem }) {
    const isSavings = e.category.slug === SAVINGS_SLUG;
    const cardColor = e.card?.color ?? CASH_COLOR;
    const cardName = e.card?.name ?? "Cash";
    return (
        <li
            className={`flex items-center gap-3 py-2.5 pr-4 pl-4 ${isSavings ? "border-l-[3px] border-positive bg-positive-tint" : "relative"}`}
        >
            {isSavings ? null : (
                <span
                    aria-hidden
                    className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: e.category.color }}
                />
            )}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                    {e.description}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {formatExpenseDate(e.date)}
                    {isSavings ? null : (
                        <>
                            {" · "}
                            <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: cardColor }}
                            />
                            {cardName}
                        </>
                    )}
                </span>
            </span>
            <span className="text-right whitespace-nowrap">
                <span
                    className={`block text-sm font-semibold ${isSavings ? "text-positive" : ""}`}
                >
                    {formatMxn(e.amount)}
                </span>
                {isSavings ? (
                    <span className="block text-xs text-positive">
                        set aside
                    </span>
                ) : e.isShared ? (
                    <span className="block text-xs text-positive">
                        {`share ${formatMxn(e.actualExpenditure)}`}
                    </span>
                ) : (
                    <span className="block text-xs text-muted-foreground">
                        solo
                    </span>
                )}
            </span>
        </li>
    );
}

/** One money-movement line — colour-tagged by type (ADR-0018, spec 0004). */
function MovementRow({
    movement: m,
    partnerName,
}: {
    movement: MovementListItem;
    partnerName: string;
}) {
    const { label, amountClass, rowTint } = movementDisplay(
        m.type,
        partnerName,
    );
    // Card payments carry their card name; transfers carry their note.
    const subline =
        m.type === "card_payment" ? (m.card?.name ?? "") : (m.note ?? "");

    return (
        <li
            className={`flex items-center gap-3 border-l-[3px] py-2.5 pr-4 pl-4 ${rowTint}`}
        >
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                    {label}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {formatExpenseDate(m.date)}
                    {subline ? ` · ${subline}` : ""}
                </span>
            </span>
            <span
                className={`text-right text-sm font-semibold whitespace-nowrap ${amountClass}`}
            >
                {formatMxn(m.amount)}
            </span>
        </li>
    );
}

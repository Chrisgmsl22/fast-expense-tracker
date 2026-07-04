import { SAVINGS_SLUG } from "@/lib/domain/dashboard";
import {
    computeFeedTotals,
    partnerOwesYou,
    type MovementType,
} from "@/lib/domain/movement";
import { buildFeed } from "@/lib/feed";
import { PARTNER_NAME } from "@/lib/partner";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";
import type { MovementListItem } from "@/lib/repositories/movement.repository";

const CASH_COLOR = "#16a34a";

/**
 * Right-rail month feed — a read-only list of the month's expenses **and money
 * movements** (card payments, transfers to the partner), newest first, with a
 * pinned footer. Movements are colour-tagged (card payment blue, "I paid
 * {partner}" amber) and never enter the spend total. The footer splits money into
 * Charged / What I really spent (consumption) / Set aside (savings) / Paid to
 * {partner} / Total. A soft "{partner} owes you" reminder sits on top (ADR-0018).
 */
export function MonthFeed({
    expenses,
    movements,
    monthLabel,
}: {
    expenses: ExpenseListItem[];
    movements: MovementListItem[];
    monthLabel: string;
}) {
    const feed = buildFeed(expenses, movements);

    const paidToPartner = sumByType(movements, "gf_paid");
    const fundedByPartner = movements
        .filter((m) => m.type === "card_payment" && m.fundedByPartner)
        .reduce((sum, m) => sum + m.amount, 0);
    const partnerOwes = partnerOwesYou(expenses, fundedByPartner);
    const totals = computeFeedTotals(expenses, paidToPartner);

    const count = feed.length;

    return (
        <div className="flex flex-col rounded-lg border lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)]">
            <div className="border-b p-4">
                <p className="text-sm font-medium">
                    All activity · {monthLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                    {count} {count === 1 ? "entry" : "entries"}
                    {count > 0 ? " · scroll" : ""}
                </p>
            </div>

            {partnerOwes > 0 ? (
                <div className="border-b bg-muted/40 px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground">
                        {PARTNER_NAME} owes you
                    </span>{" "}
                    <span className="font-semibold text-foreground">
                        {formatMxn(partnerOwes)}
                    </span>
                    <span className="mt-0.5 block text-muted-foreground">
                        est. — her share of shared expenses, minus what
                        she&rsquo;s covered
                    </span>
                </div>
            ) : null}

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
                            />
                        ),
                    )}
                </ul>
            )}

            {count > 0 && (
                <div
                    data-testid="feed-totals"
                    className="space-y-1 border-t p-4 text-sm"
                >
                    <div className="flex justify-between">
                        <span className="font-medium text-foreground">
                            Charged
                        </span>
                        <span className="font-semibold text-foreground">
                            {formatMxn(totals.charged)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                            What I really spent
                        </span>
                        <span className="rounded-full bg-spent-tint px-2 py-0.5 font-semibold text-spent">
                            {formatMxn(totals.whatIReallySpent)}
                        </span>
                    </div>
                    {totals.setAside > 0 && (
                        <div className="flex justify-between">
                            <span className="font-medium text-foreground">
                                Set aside
                            </span>
                            <span className="font-semibold text-bucket-savings">
                                {formatMxn(totals.setAside)}
                            </span>
                        </div>
                    )}
                    {totals.paidToPartner > 0 && (
                        <div className="flex justify-between">
                            <span className="font-medium text-foreground">
                                Paid to {PARTNER_NAME}
                            </span>
                            <span className="font-semibold text-transfer">
                                {formatMxn(totals.paidToPartner)}
                            </span>
                        </div>
                    )}
                    {/* Total only when it says something beyond "what I really
                        spent" — i.e. savings or a transfer added to it. */}
                    {(totals.setAside > 0 || totals.paidToPartner > 0) && (
                        <div className="flex justify-between border-t pt-1">
                            <span className="font-medium text-foreground">
                                Total
                            </span>
                            <span className="font-semibold text-foreground">
                                {formatMxn(totals.total)}
                            </span>
                        </div>
                    )}
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
        <li className="relative flex items-center gap-3 py-2.5 pr-4 pl-4">
            <span
                aria-hidden
                className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-full"
                style={{ backgroundColor: e.category.color }}
            />
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
                <span className="block text-sm font-semibold">
                    {formatMxn(e.amount)}
                </span>
                {e.isShared ? (
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

/** One money-movement line — colour-tagged by type (ADR-0018). */
function MovementRow({ movement: m }: { movement: MovementListItem }) {
    const isCardPayment = m.type === "card_payment";
    const accent = isCardPayment ? "bg-payment" : "bg-transfer";
    const amountColor = isCardPayment ? "text-payment" : "text-transfer";
    const label = isCardPayment ? "Card payment" : `Paid ${PARTNER_NAME}`;
    const subline = isCardPayment
        ? [m.card?.name, m.fundedByPartner ? `${PARTNER_NAME}'s money` : null]
              .filter(Boolean)
              .join(" · ")
        : (m.note ?? "");

    return (
        <li className="relative flex items-center gap-3 py-2.5 pr-4 pl-4">
            <span
                aria-hidden
                className={`absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-full ${accent}`}
            />
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
                className={`text-right text-sm font-semibold whitespace-nowrap ${amountColor}`}
            >
                {formatMxn(m.amount)}
            </span>
        </li>
    );
}

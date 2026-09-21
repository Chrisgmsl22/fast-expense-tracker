import { SAVINGS_SLUG } from "@/lib/domain/dashboard";
import { computeFeedTotals } from "@/lib/domain/movement";
import { FundingBadge } from "@/components/expense/FundingBadge";
import { SummaryRail } from "@/components/money/SummaryRail";
import type { CoupleBalance } from "@/lib/domain/settlement";
import { buildFeed } from "@/lib/feed";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";
import type { MovementListItem } from "@/lib/repositories/movement.repository";
import { expenseCardLabel } from "@/lib/expense-display";
import {
    movementDisplay,
    movementRowText,
} from "@/components/movement/movement-display";
import { SettlementReminder } from "@/components/money/SettlementReminder";

/**
 * Right-rail month feed — a read-only list of the month's expenses **and money
 * movements** (card payments, transfers to the partner), newest first, with a
 * pinned footer. A debt she fronted never reaches this list: it is
 * settlement-only and provisional (spec 0007 §6b). The footer keeps the
 * consumption and cash lines apart, never summed (spec 0007 §6a).
 */
export function MonthFeed({
    expenses,
    movements,
    monthLabel,
    settlement,
    partnerName,
    sharesExpenses,
    isCurrentMonth,
    incomeTotal,
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
    /** False while browsing another month — the settlement chip then says so. */
    isCurrentMonth: boolean;
    /** This month's income, for the breakdown modal's "% of income" line. */
    incomeTotal?: number;
}) {
    const feed = buildFeed(expenses, movements);

    // Movements go in because a legacy `gf_paid` transfer is still a movement until
    // the data PR converts it; the footer would otherwise drop its money.
    const totals = computeFeedTotals(expenses, movements);

    const count = feed.length;

    return (
        <div className="flex max-h-[70vh] flex-col rounded-lg border xl:sticky xl:top-6 xl:max-h-[calc(100vh-9rem)]">
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
                                partnerName={partnerName}
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
                <SummaryRail
                    totals={totals}
                    monthLabel={monthLabel}
                    partnerName={partnerName}
                    settlement={settlement}
                    sharesExpenses={sharesExpenses}
                    isCurrentMonth={isCurrentMonth}
                    incomeTotal={incomeTotal}
                />
            )}

            {count === 0 && (
                <SettlementReminder
                    settlement={settlement}
                    partnerName={partnerName}
                    sharesExpenses={sharesExpenses}
                    isCurrentMonth={isCurrentMonth}
                    monthLabel={monthLabel}
                    className="border-t p-4"
                />
            )}
        </div>
    );
}

/** One expense line (neutral). */
function ExpenseRow({
    expense: e,
    partnerName,
}: {
    expense: ExpenseListItem;
    partnerName: string;
}) {
    const isSavings = e.category.slug === SAVINGS_SLUG;
    // Same helper the Expenses list uses, so the two screens cannot print
    // different words for the same row.
    const { name: cardName, color: cardColor } = expenseCardLabel(
        e,
        partnerName,
    );
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
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                        {e.description}
                    </span>
                    {e.fundedFrom === "income" ? null : (
                        <FundingBadge source={e.fundedFrom} />
                    )}
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
    const { amountClass, rowTint } = movementDisplay(m.type, partnerName);
    // `buildFeed` drops a debt she fronted, so only card payments and transfers reach here.
    const { title, subline } = movementRowText(m, partnerName);

    return (
        <li
            className={`flex items-center gap-3 border-l-[3px] py-2.5 pr-4 pl-4 ${rowTint}`}
        >
            <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                        {title}
                    </span>
                    {m.fundedFrom === "income" ? null : (
                        <FundingBadge source={m.fundedFrom} />
                    )}
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

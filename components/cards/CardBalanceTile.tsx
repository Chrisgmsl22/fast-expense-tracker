import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBalance } from "@/lib/format";
import { CardStatementLines } from "./CardStatementLines";
import {
    balanceFootnote,
    cardTypeLabel,
    headlineState,
    isSettled,
    stateLabel,
    type CardBalanceView,
} from "./card-balance-display";

type Props = {
    card: CardBalanceView;
    monthName: string;
    /** `trigger` is the clicked control, so focus can return to it. */
    onOpen: (card: CardBalanceView, trigger: HTMLElement) => void;
    onLogPayment: (card: CardBalanceView, trigger: HTMLElement) => void;
};

// This ::after stretches over the whole tile, so a click anywhere opens the
// drawer, while "Log a payment" sits above it (z-10) as its own button. It lives
// on the row, not the name: `truncate` there would clip it to the name's box.
const STRETCHED = "after:absolute after:inset-0 after:rounded-xl";

export function CardBalanceTile({
    card,
    monthName,
    onOpen,
    onLogPayment,
}: Props) {
    const head = headlineState(card);
    const quiet = head === "untouched";
    const foot = balanceFootnote(card, monthName, head);
    return (
        <article
            aria-label={card.name}
            className="relative flex flex-col gap-3.5 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/40"
        >
            <button
                type="button"
                onClick={(e) => onOpen(card, e.currentTarget)}
                aria-label={`${card.name} details`}
                data-card-trigger={card.id}
                className={cn(
                    "flex min-w-0 items-center gap-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    STRETCHED,
                )}
            >
                {/* The swatch takes the card's own colour from data, never a theme token. */}
                <span
                    aria-hidden
                    className="h-5 w-[30px] shrink-0 rounded"
                    style={{ backgroundColor: card.color }}
                />
                <span
                    className={cn(
                        "min-w-0 truncate text-sm font-semibold",
                        quiet && "text-muted-foreground",
                    )}
                >
                    {card.name}
                </span>
                <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {cardTypeLabel(card.type)}
                </span>
                <ChevronRight
                    aria-hidden
                    className="ml-auto size-4 shrink-0 text-muted-foreground"
                />
            </button>
            <div>
                <p
                    className={cn(
                        "text-[11px] font-semibold tracking-wide uppercase",
                        isSettled(head)
                            ? "text-positive"
                            : "text-muted-foreground",
                    )}
                >
                    {stateLabel(head, monthName)}
                </p>
                {/* A quiet card's $0.00 would read as paid off: the label says it all. */}
                {quiet ? null : (
                    <p className="mt-0.5 text-[28px] font-bold tracking-tight tabular-nums">
                        {formatBalance(card.balance)}
                    </p>
                )}
                {foot ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {foot}
                    </p>
                ) : null}
            </div>
            {/* Four zero lines say nothing a month with no rows has not said. */}
            {quiet ? null : (
                <CardStatementLines
                    statement={card}
                    monthName={monthName}
                    className="border-t pt-3"
                />
            )}
            <Button
                type="button"
                variant="outline"
                className="relative z-10"
                onClick={(e) => onLogPayment(card, e.currentTarget)}
                aria-label={`Log a payment on ${card.name}`}
            >
                Log a payment
            </Button>
        </article>
    );
}

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBalance, formatMxn } from "@/lib/format";
import { CardStatementLines } from "./CardStatementLines";
import {
    cardTypeLabel,
    headlineState,
    isSettled,
    stateLabel,
    type CardBalanceView,
    type CardHeadlineState,
} from "./card-balance-display";

type Props = {
    card: CardBalanceView;
    monthName: string;
    /** `trigger` is the clicked control, so focus can return to it. */
    onOpen: (card: CardBalanceView, trigger: HTMLElement) => void;
    onLogPayment: (card: CardBalanceView, trigger: HTMLElement) => void;
};

function footnote(
    card: CardBalanceView,
    monthName: string,
    head: CardHeadlineState,
): string | null {
    if (head === "paid") return `Nothing owed at end of ${monthName}`;
    if (head === "credit")
        return `You paid ${formatMxn(Math.abs(card.balance))} more than you owed`;
    return null;
}

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
    const foot = footnote(card, monthName, head);
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
                <span className="min-w-0 truncate text-sm font-semibold">
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
                <p
                    className={cn(
                        "mt-0.5 text-[28px] font-bold tracking-tight tabular-nums",
                        card.state === "credit" && "text-positive",
                    )}
                >
                    {formatBalance(card.balance)}
                </p>
                {foot ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {foot}
                    </p>
                ) : null}
            </div>
            {/* Four zero lines say nothing a month with no rows has not said. */}
            {head === "untouched" ? null : (
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

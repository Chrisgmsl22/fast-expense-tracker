import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBalance, formatMxn } from "@/lib/format";
import { CardStatementLines } from "./CardStatementLines";
import {
    cardTypeLabel,
    stateLabel,
    type CardBalanceView,
} from "./card-balance-display";

type Props = {
    card: CardBalanceView;
    monthName: string;
    onOpen: (card: CardBalanceView) => void;
    onLogPayment: (card: CardBalanceView) => void;
};

function footnote(card: CardBalanceView, monthName: string): string | null {
    if (card.state === "paid") return `Nothing owed at end of ${monthName}`;
    if (card.state === "credit")
        return `You paid ${formatMxn(Math.abs(card.balance))} more than you owed`;
    return null;
}

// The name's ::after stretches over the whole tile, so a click anywhere opens the
// drawer, while "Log a payment" sits above it (z-10) as its own button.
const STRETCHED = "after:absolute after:inset-0 after:rounded-xl";

export function CardBalanceTile({
    card,
    monthName,
    onOpen,
    onLogPayment,
}: Props) {
    const foot = footnote(card, monthName);
    return (
        <article
            aria-label={card.name}
            className="relative flex flex-col gap-3.5 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/40"
        >
            <button
                type="button"
                data-card-trigger={card.id}
                onClick={() => onOpen(card)}
                aria-label={`${card.name} details`}
                className="flex items-center gap-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                {/* The swatch takes the card's own colour from data, never a theme token. */}
                <span
                    aria-hidden
                    className="h-5 w-[30px] shrink-0 rounded"
                    style={{ backgroundColor: card.color }}
                />
                <span className={cn("text-sm font-semibold", STRETCHED)}>
                    {card.name}
                </span>
                <span className="text-xs text-muted-foreground">
                    {cardTypeLabel(card.type)}
                </span>
                <ChevronRight
                    aria-hidden
                    className="ml-auto size-4 text-muted-foreground"
                />
            </button>
            <div>
                <p
                    className={cn(
                        "text-[11px] font-semibold tracking-wide uppercase",
                        card.state === "owed"
                            ? "text-muted-foreground"
                            : "text-positive",
                    )}
                >
                    {stateLabel(card.state, monthName)}
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
            <CardStatementLines
                statement={card}
                monthName={monthName}
                className="border-t pt-3"
            />
            <Button
                type="button"
                variant="outline"
                className="relative z-10"
                onClick={() => onLogPayment(card)}
                aria-label={`Log a payment on ${card.name}`}
            >
                Log a payment
            </Button>
        </article>
    );
}

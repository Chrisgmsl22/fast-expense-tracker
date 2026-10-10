import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBalance, formatMxnCompact } from "@/lib/format";
import {
    cardTypeLabel,
    stateLabel,
    type CardBalanceView,
} from "./card-balance-display";

type Props = {
    card: CardBalanceView;
    onOpen: (card: CardBalanceView) => void;
};

/** The mobile card row: one tap opens the detail drawer. */
export function CardBalanceRow({ card, onOpen }: Props) {
    return (
        <button
            type="button"
            data-card-trigger={card.id}
            aria-label={`${card.name}, ${formatBalance(card.balance)}, ${stateLabel(card.state)}`}
            onClick={() => onOpen(card)}
            className="flex min-h-[88px] w-full flex-col gap-2 rounded-xl border bg-card px-3.5 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
            <span className="flex w-full items-center gap-2.5">
                <span
                    aria-hidden
                    className="h-[17px] w-[26px] shrink-0 rounded"
                    style={{ backgroundColor: card.color }}
                />
                <span className="truncate text-[15px] font-semibold">
                    {card.name}
                </span>
                <span
                    className={cn(
                        "ml-auto text-[17px] font-bold tabular-nums",
                        card.state === "credit" && "text-positive",
                    )}
                >
                    {formatBalance(card.balance)}
                </span>
                <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
            </span>
            <span className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                <span>{cardTypeLabel(card.type)}</span>
                <span aria-hidden>·</span>
                <span>
                    {card.opening < 0 ? "−" : ""}
                    {formatMxnCompact(card.opening)} +{" "}
                    {formatMxnCompact(card.charged)} −{" "}
                    {formatMxnCompact(card.paid)} −{" "}
                    {formatMxnCompact(card.redeemed)}
                </span>
                <span
                    className={cn(
                        "ml-auto text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase",
                        card.state !== "owed" && "text-positive",
                    )}
                >
                    {stateLabel(card.state)}
                </span>
            </span>
        </button>
    );
}

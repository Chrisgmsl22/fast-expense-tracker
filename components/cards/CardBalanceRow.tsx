import { useId } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBalance, formatMxnCompactAbs } from "@/lib/format";
import {
    cardTypeLabel,
    headlineState,
    isSettled,
    stateLabel,
    type CardBalanceView,
} from "./card-balance-display";

type Props = {
    card: CardBalanceView;
    /** `trigger` is the clicked control, so focus can return to it. */
    onOpen: (card: CardBalanceView, trigger: HTMLElement) => void;
};

/** The mobile card row: one tap opens the detail drawer. */
export function CardBalanceRow({ card, onOpen }: Props) {
    const head = headlineState(card);
    const id = useId();
    const typeId = `${id}-type`;
    const breakdownId = `${id}-breakdown`;
    return (
        <button
            type="button"
            aria-label={`${card.name}, ${formatBalance(card.balance)}, ${stateLabel(head)}`}
            // The label replaces the row's content, so the line beneath it is
            // handed to assistive tech as the description.
            aria-describedby={
                head === "untouched" ? typeId : `${typeId} ${breakdownId}`
            }
            onClick={(e) => onOpen(card, e.currentTarget)}
            data-card-trigger={card.id}
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
                <span id={typeId}>{cardTypeLabel(card.type)}</span>
                {head === "untouched" ? null : (
                    <>
                        <span aria-hidden>·</span>
                        <span id={breakdownId}>
                            {card.opening < 0 ? "−" : ""}
                            {formatMxnCompactAbs(card.opening)} +{" "}
                            {formatMxnCompactAbs(card.charged)} −{" "}
                            {formatMxnCompactAbs(card.paid)} −{" "}
                            {formatMxnCompactAbs(card.redeemed)}
                        </span>
                    </>
                )}
                <span
                    className={cn(
                        "ml-auto text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase",
                        isSettled(head) && "text-positive",
                    )}
                >
                    {stateLabel(head)}
                </span>
            </span>
        </button>
    );
}

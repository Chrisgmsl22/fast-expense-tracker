"use client";

import { useState } from "react";
import { ArrowDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { CardHistoryLine } from "@/lib/domain/card-balance";
import { formatBalance, formatExpenseDate, formatMxn } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    cardTypeLabel,
    headlineState,
    isSettled,
    stateLabel,
    type CardBalanceView,
} from "./card-balance-display";
import { CardStatementLines } from "./CardStatementLines";

export type CardHistoryState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; opening: number; lines: CardHistoryLine[] };

type Props = {
    open: boolean;
    card: CardBalanceView | null;
    monthName: string;
    history: CardHistoryState;
    onClose: () => void;
    onLogPayment: (card: CardBalanceView) => void;
};

const FIRST_PAGE = 20;

function HistoryRow({ line }: { line: CardHistoryLine }) {
    const isCharge = line.kind === "charge";
    const detail = [
        formatExpenseDate(line.date),
        line.detail,
        line.isShared ? "shared, full amount" : null,
    ]
        .filter(Boolean)
        .join(" · ");
    return (
        <li className="flex items-center gap-2.5 border-b py-2.5 tabular-nums last:border-b-0">
            <span
                aria-hidden
                className={cn(
                    "flex size-[30px] shrink-0 items-center justify-center rounded-lg",
                    isCharge ? "bg-muted" : "bg-payment-tint text-payment",
                )}
            >
                {isCharge ? (
                    <Plus className="size-3.5" />
                ) : (
                    <ArrowDown className="size-3.5" />
                )}
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                    {isCharge ? line.description : "Payment"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                    {detail}
                </p>
            </div>
            <div className="ml-auto shrink-0 text-right">
                <p
                    className={cn(
                        "text-sm font-bold",
                        !isCharge && "text-payment",
                    )}
                >
                    {isCharge ? "+" : "−"}{" "}
                    {formatMxn(Math.abs(line.signedAmount))}
                </p>
                <p className="text-[10px] text-muted-foreground">
                    bal {formatBalance(line.balanceAfter)}
                </p>
            </div>
        </li>
    );
}

function OpeningRow({ opening }: { opening: number }) {
    return (
        <li className="flex items-center justify-between py-2.5 text-sm tabular-nums">
            <span className="font-semibold">Opening balance</span>
            <span className="font-bold">{formatBalance(opening)}</span>
        </li>
    );
}

function History({
    history,
    monthName,
}: {
    history: CardHistoryState;
    monthName: string;
}) {
    const [showAll, setShowAll] = useState(false);
    if (history.status === "loading") {
        return (
            <p role="status" className="py-3 text-sm text-muted-foreground">
                Loading history…
            </p>
        );
    }
    if (history.status === "error") {
        return (
            <p role="alert" className="py-3 text-sm text-destructive">
                {history.message}
            </p>
        );
    }
    const shown = showAll ? history.lines : history.lines.slice(0, FIRST_PAGE);
    const hidden = history.lines.length - shown.length;
    return (
        <>
            <ul aria-label="History">
                {shown.map((line) => (
                    <HistoryRow key={`${line.kind}-${line.id}`} line={line} />
                ))}
                {hidden === 0 ? <OpeningRow opening={history.opening} /> : null}
            </ul>
            {history.lines.length === 0 ? (
                <p className="py-1 text-sm text-muted-foreground">
                    Nothing logged on this card in {monthName}.
                </p>
            ) : null}
            {hidden > 0 ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="my-2 self-start text-muted-foreground"
                    onClick={() => setShowAll(true)}
                >
                    Show {hidden} earlier {hidden === 1 ? "entry" : "entries"}
                </Button>
            ) : null}
        </>
    );
}

/** Slides in from the right: the card's summary, its payment action, then history. */
export function CardBalanceDrawer({
    open,
    card,
    monthName,
    history,
    onClose,
    onLogPayment,
}: Props) {
    const head = card ? headlineState(card) : null;
    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <SheetContent
                side="right"
                className="w-full max-w-full gap-0 overflow-x-hidden overflow-y-auto p-0 sm:w-[500px]"
            >
                {card && head ? (
                    <>
                        <div className="flex flex-col gap-3.5 border-b px-5 py-4">
                            <div className="flex items-center gap-2.5 pr-8">
                                <span
                                    aria-hidden
                                    className="h-5 w-[30px] shrink-0 rounded"
                                    style={{ backgroundColor: card.color }}
                                />
                                <SheetTitle className="text-base font-bold">
                                    {card.name}
                                </SheetTitle>
                                <span className="text-xs text-muted-foreground">
                                    {cardTypeLabel(card.type)}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-end gap-4">
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
                                            "text-3xl font-bold tracking-tight tabular-nums",
                                            card.state === "credit" &&
                                                "text-positive",
                                        )}
                                    >
                                        {formatBalance(card.balance)}
                                    </p>
                                </div>
                                {head === "untouched" ? null : (
                                    <CardStatementLines
                                        statement={card}
                                        monthName={monthName}
                                        className="ml-auto"
                                    />
                                )}
                            </div>
                            <Button
                                type="button"
                                className="h-9"
                                onClick={() => onLogPayment(card)}
                            >
                                Log a payment
                            </Button>
                            <p className="text-[11px] text-muted-foreground">
                                Based on logged expenses and card payments. If
                                your bank shows a different number, an entry is
                                missing here.
                            </p>
                        </div>
                        <div className="flex flex-col px-5 pt-3.5 pb-4">
                            <p className="pb-1 text-xs font-semibold">
                                History{" "}
                                <span className="font-normal text-muted-foreground">
                                    · newest first
                                </span>
                            </p>
                            <History
                                key={card.id}
                                history={history}
                                monthName={monthName}
                            />
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

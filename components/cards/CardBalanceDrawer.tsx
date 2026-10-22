"use client";

import { useState } from "react";
import { ArrowDown, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { CardHistoryLine } from "@/lib/domain/card-balance";
import { useCategoryName } from "@/i18n/category-name";
import { formatBalance, formatExpenseDate, formatMxn } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    balanceFootnote,
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
    | { status: "ready"; lines: CardHistoryLine[] };

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
    const t = useTranslations("money.cards.drawer");
    const locale = useLocale();
    const categoryName = useCategoryName();
    const isCharge = line.kind === "charge";
    // A charge's detail is its stored category name; a payment's is the user's note.
    const lineDetail =
        isCharge && line.detail ? categoryName(line.detail) : line.detail;
    const detail = [
        formatExpenseDate(line.date, locale),
        lineDetail,
        line.isShared ? t("shared") : null,
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
                    {isCharge ? line.description : t("payment")}
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
                    {t("balanceAfter", {
                        amount: formatBalance(line.balanceAfter),
                    })}
                </p>
            </div>
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
    const t = useTranslations("money.cards.drawer");
    const [showAll, setShowAll] = useState(false);
    if (history.status === "loading") {
        return (
            <p role="status" className="py-3 text-sm text-muted-foreground">
                {t("loading")}
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
            <ul aria-label={t("history")}>
                {shown.map((line) => (
                    <HistoryRow key={`${line.kind}-${line.id}`} line={line} />
                ))}
            </ul>
            {history.lines.length === 0 ? (
                <p className="py-1 text-sm text-muted-foreground">
                    {t("empty", { month: monthName })}
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
                    {t("showEarlier", { count: hidden })}
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
    const t = useTranslations("money.cards");
    const head = card ? headlineState(card) : null;
    const quiet = head === "untouched";
    const foot =
        card && head ? balanceFootnote(card, monthName, head, t) : null;
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
                                    {cardTypeLabel(card.type, t)}
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
                                        {stateLabel(head, t, monthName)}
                                    </p>
                                    {quiet ? null : (
                                        <p className="text-3xl font-bold tracking-tight tabular-nums">
                                            {formatBalance(card.balance)}
                                        </p>
                                    )}
                                    {foot ? (
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                                            {foot}
                                        </p>
                                    ) : null}
                                </div>
                                {quiet ? null : (
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
                                {t("logPayment")}
                            </Button>
                            <p className="text-[11px] text-muted-foreground">
                                {t("drawer.monthNote")}
                            </p>
                        </div>
                        <div className="flex flex-col px-5 pt-3.5 pb-4">
                            <p className="pb-1 text-xs font-semibold">
                                {t("drawer.history")}{" "}
                                <span className="font-normal text-muted-foreground">
                                    {t("drawer.newestFirst")}
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

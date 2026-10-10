"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getCardHistory } from "@/app/_actions/card/get-history";
import { formatMxn } from "@/lib/format";
import { MonthPicker } from "@/components/expense/MonthPicker";
import {
    namesInState,
    owedBreakdown,
    type CardBalanceView,
    type CardBalancesView,
} from "./card-balance-display";
import { CardBalanceTile } from "./CardBalanceTile";
import { CardBalanceRow } from "./CardBalanceRow";
import { CardBalanceDrawer, type CardHistoryState } from "./CardBalanceDrawer";
import { CardBalanceNotice } from "./CardBalanceNotice";
import { LogCardPaymentDialog } from "./LogCardPaymentDialog";

type Props = {
    summary: CardBalancesView;
    month: string;
    /** "September": names the month in every label. */
    monthName: string;
    currentMonth: string;
};

type TotalsProps = { summary: CardBalancesView; monthName: string };

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
            <CreditCard aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-semibold">No cards yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
                Add a credit card in Settings → Cards. Its balance shows up
                here. Cash and debit cards spend money you already have, so they
                never appear here.
            </p>
            <Link
                href="/settings#cards"
                className={buttonVariants({
                    variant: "outline",
                    className: "mt-1.5",
                })}
            >
                Go to Cards
            </Link>
        </div>
    );
}

function Totals({ summary, monthName }: TotalsProps) {
    const breakdown = owedBreakdown(summary.cards);
    return (
        <section
            aria-label="Totals"
            className="hidden rounded-xl border bg-card sm:flex sm:flex-col md:flex-row"
        >
            <div className="border-b px-5 py-4 md:min-w-[300px] md:border-r md:border-b-0">
                <p className="text-[11px] text-muted-foreground">
                    Total owed at end of {monthName}
                </p>
                <p className="mt-0.5 text-3xl font-bold tracking-tight tabular-nums">
                    {formatMxn(summary.totalOwed)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {breakdown || "Nothing owed on any card"}
                </p>
            </div>
            {summary.totalCredit > 0 ? (
                <div className="border-b px-5 py-4 md:border-r md:border-b-0">
                    <p className="text-[11px] text-muted-foreground">
                        A card owes you
                    </p>
                    <p className="mt-1.5 text-lg font-bold text-positive tabular-nums">
                        {formatMxn(summary.totalCredit)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {namesInState(summary.cards, "credit")}, overpaid · not
                        subtracted above
                    </p>
                </div>
            ) : null}
            <div className="flex flex-1 flex-col justify-center gap-1.5 px-5 py-4">
                <p className="text-[11px] text-muted-foreground">
                    How a balance is made
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-semibold">Opening balance</span>
                    <span className="text-muted-foreground">+</span>
                    <span className="font-semibold">Charged</span>
                    <span className="text-muted-foreground">
                        full amount, even when split
                    </span>
                    <span className="text-muted-foreground">−</span>
                    <span className="font-semibold text-payment">Payments</span>
                    <span className="text-muted-foreground">−</span>
                    <span className="font-semibold">Points redeemed</span>
                    <span className="text-muted-foreground">=</span>
                    <span className="font-bold">Owed</span>
                </p>
            </div>
        </section>
    );
}

function CompactTotals({ summary, monthName }: TotalsProps) {
    const credits = summary.cards.filter((c) => c.state === "credit");
    return (
        <section
            aria-label="Total owed"
            className="flex flex-col gap-3 sm:hidden"
        >
            <div className="rounded-xl border bg-card px-4 py-3.5">
                <p className="text-[11px] text-muted-foreground">
                    Total owed at end of {monthName}
                </p>
                <p className="text-3xl font-bold tracking-tight tabular-nums">
                    {formatMxn(summary.totalOwed)}
                </p>
                {credits.map((card) => (
                    <p
                        key={card.id}
                        className="mt-2 flex items-center gap-1.5 border-t pt-2 text-xs"
                    >
                        <span
                            aria-hidden
                            className="size-[7px] rounded-full bg-positive"
                        />
                        {card.name} owes you
                        <span className="ml-auto font-bold text-positive tabular-nums">
                            {formatMxn(Math.abs(card.balance))}
                        </span>
                    </p>
                ))}
            </div>
            <p className="px-0.5 text-[11px] text-muted-foreground">
                Opening balance + charged (full amount, even when split) −
                payments − points redeemed
            </p>
        </section>
    );
}

// The tile and the mobile row for one card both carry this; only one is shown.
function visibleCardTrigger(cardId: string): HTMLElement | null {
    const triggers = document.querySelectorAll<HTMLElement>(
        "[data-card-trigger]",
    );
    return (
        [...triggers].find(
            (el) =>
                el.dataset.cardTrigger === cardId &&
                (el.checkVisibility?.() ?? true),
        ) ?? null
    );
}

/**
 * Card balances: a tile per active card (a compact row on a phone), a detail
 * drawer with history, and the payment dialog.
 */
export function CardBalancesScreen({
    summary,
    month,
    monthName,
    currentMonth,
}: Props) {
    const router = useRouter();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerCard, setDrawerCard] = useState<CardBalanceView | null>(null);
    const [history, setHistory] = useState<CardHistoryState>({
        status: "loading",
    });
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [paymentCard, setPaymentCard] = useState<CardBalanceView | null>(
        null,
    );
    const latestRequest = useRef(0);

    const { cards } = summary;
    // Pay full and the before → after line read today's balance, so only the
    // current month offers them.
    const isCurrentMonth = month === currentMonth;
    const balances = Object.fromEntries(cards.map((c) => [c.id, c.balance]));

    async function openDrawer(card: CardBalanceView) {
        setDrawerCard(card);
        setDrawerOpen(true);
        setHistory({ status: "loading" });
        const request = ++latestRequest.current;
        const failed = {
            status: "error",
            message: "Could not load the card history. Please try again.",
        } as const;
        try {
            const res = await getCardHistory({ id: card.id, month });
            if (request !== latestRequest.current) return;
            setHistory(
                res.ok
                    ? { status: "ready", ...res.data }
                    : { status: "error", message: res.message },
            );
        } catch {
            if (request === latestRequest.current) setHistory(failed);
        }
    }

    function openPayment(card: CardBalanceView) {
        setDrawerOpen(false);
        setPaymentCard(card);
        setPaymentOpen(true);
    }

    function onPaid() {
        setPaymentOpen(false);
        router.refresh();
    }

    if (cards.length === 0) {
        return (
            <div className="flex flex-col gap-3.5">
                <CardBalanceNotice />
                <EmptyState />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3.5">
            <MonthPicker month={month} remember currentMonth={currentMonth} />
            <CardBalanceNotice />
            <Totals summary={summary} monthName={monthName} />
            <CompactTotals summary={summary} monthName={monthName} />

            <div className="hidden gap-3.5 sm:grid sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => (
                    <CardBalanceTile
                        key={card.id}
                        card={card}
                        monthName={monthName}
                        onOpen={openDrawer}
                        onLogPayment={openPayment}
                    />
                ))}
            </div>
            <div className="flex flex-col gap-2.5 sm:hidden">
                {cards.map((card) => (
                    <CardBalanceRow
                        key={card.id}
                        card={card}
                        onOpen={openDrawer}
                    />
                ))}
            </div>

            <CardBalanceDrawer
                open={drawerOpen}
                card={drawerCard}
                monthName={monthName}
                history={history}
                onClose={() => setDrawerOpen(false)}
                onLogPayment={openPayment}
            />
            <LogCardPaymentDialog
                open={paymentOpen}
                card={paymentCard}
                cards={cards}
                balances={isCurrentMonth ? balances : undefined}
                onClose={() => setPaymentOpen(false)}
                onSuccess={onPaid}
                returnFocus={() =>
                    paymentCard ? visibleCardTrigger(paymentCard.id) : null
                }
            />
        </div>
    );
}

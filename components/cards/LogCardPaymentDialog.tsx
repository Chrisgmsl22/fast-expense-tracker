"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CardPaymentForm } from "@/components/movement/CardPaymentForm";
import type { CardOption } from "@/components/expense/ExpenseForm";
import type { CardBalanceView } from "./card-balance-display";

type Props = {
    open: boolean;
    card: CardBalanceView | null;
    cards: CardOption[];
    balances?: Readonly<Record<string, number>>;
    onClose: () => void;
    onSuccess: () => void;
    /** Where focus lands when the dialog closes; null keeps the default. */
    returnFocus: () => HTMLElement | null;
};

/** The existing card payment form, opened on one card, saving through `addCardPayment`. */
export function LogCardPaymentDialog({
    open,
    card,
    cards,
    balances,
    onClose,
    onSuccess,
    returnFocus,
}: Props) {
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent
                className="sm:max-w-lg"
                finalFocus={() => returnFocus() ?? true}
            >
                <DialogHeader>
                    <DialogTitle>Log a payment</DialogTitle>
                </DialogHeader>
                {card ? (
                    <CardPaymentForm
                        key={card.id}
                        cards={cards}
                        defaultCardId={card.id}
                        balances={balances}
                        onCancel={onClose}
                        onSuccess={onSuccess}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from "@/components/ui/select";
import {
    addCardPayment,
    type AddCardPaymentResult,
} from "@/app/_actions/movement/add-card-payment";
import {
    updateCardPayment,
    type UpdateCardPaymentResult,
} from "@/app/_actions/movement/update-card-payment";
import type { FieldErrors } from "@/lib/actions/result";
import { balanceAfterPayment, payFullAmount } from "@/lib/domain/card-balance";
import { formatBalance, formatMonthLabel, formatMxn } from "@/lib/format";
import type { CardPaymentInput } from "@/lib/schemas/movement";
import type { CardOption } from "@/components/expense/ExpenseForm";
import { cn } from "@/lib/utils";

/** Prefilled fields when the form edits an existing payment (strings for inputs). */
export type CardPaymentEditable = {
    id: string;
    date: string;
    amount: string;
    cardId: string;
    note: string;
};

type Props = {
    cards: CardOption[];
    /** When present, the form edits this card payment instead of creating one. */
    payment?: CardPaymentEditable;
    /** The card a new payment starts on. */
    defaultCardId?: string;
    /** Current balance per card id: enables "Pay full" and the before → after line. */
    balances?: Readonly<Record<string, number>>;
    /** "2026-09": the month on screen, so a payment dated outside it says so. */
    viewingMonth?: string;
    onSuccess?: () => void;
    onCancel?: () => void;
};

/**
 * Log a card payment (ADR-0018 / ADR-0020): amount + which card. A card payment
 * is a `Movement`, decoupled from expenses and from the partner — it never enters
 * spend totals or the settlement balance. Money the partner sends is a separate
 * `gf_received` transfer. Validation + persistence live in the action.
 */
export function CardPaymentForm({
    cards,
    payment,
    defaultCardId,
    balances,
    viewingMonth,
    onSuccess,
    onCancel,
}: Props) {
    const [date, setDate] = useState(payment?.date ?? "");
    const [amount, setAmount] = useState(payment?.amount ?? "");
    const [cardId, setCardId] = useState(
        payment?.cardId ?? defaultCardId ?? "",
    );
    const [note, setNote] = useState(payment?.note ?? "");

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<CardPaymentInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const selectedCard = cards.find((c) => c.id === cardId);
    const balance = balances?.[cardId];
    const fullAmount = balance === undefined ? null : payFullAmount(balance);
    const balanceAfter =
        balance === undefined
            ? null
            : balanceAfterPayment(balance, Number(amount || 0));
    // Saving refreshes the month on screen, so a payment dated elsewhere looks
    // like nothing happened. Name where it will land instead.
    const outsideMonthNote =
        viewingMonth && date.length === 10 && date.slice(0, 7) !== viewingMonth
            ? `Lands in ${formatMonthLabel(date.slice(0, 7))}. You are viewing ${formatMonthLabel(viewingMonth)}, so this balance will not change.`
            : null;

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        startTransition(async () => {
            try {
                const res: AddCardPaymentResult | UpdateCardPaymentResult =
                    payment
                        ? await updateCardPayment({
                              id: payment.id,
                              date,
                              amount,
                              cardId,
                              note: note || undefined,
                          })
                        : await addCardPayment({
                              date,
                              amount,
                              cardId,
                              note: note || undefined,
                          });
                if (res.ok) {
                    setErrors({});
                    setFormError(null);
                    form.reset();
                    setDate("");
                    setAmount("");
                    setCardId("");
                    setNote("");
                    onSuccess?.();
                } else {
                    setErrors(res.fieldErrors ?? {});
                    setFormError(res.message);
                }
            } catch {
                setFormError("Something went wrong saving the card payment.");
            }
        });
    }

    const fieldError = (name: keyof CardPaymentInput) => {
        const msg = errors[name]?.[0];
        return msg ? (
            <p className="mt-1 text-sm text-destructive" role="alert">
                {msg}
            </p>
        ) : null;
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            aria-label={payment ? "Edit card payment" : "Add card payment"}
        >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                    <Label htmlFor="cp-date">Date</Label>
                    <Input
                        id="cp-date"
                        name="date"
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="mt-1.5"
                        aria-describedby={
                            outsideMonthNote ? "cp-date-note" : undefined
                        }
                    />
                    {fieldError("date")}
                    {/* Always in the tree: a live region that only appears when
                        it has text is announced inconsistently. */}
                    <p
                        id="cp-date-note"
                        role="status"
                        className={cn(
                            "text-xs text-muted-foreground",
                            outsideMonthNote && "mt-1.5",
                        )}
                    >
                        {outsideMonthNote}
                    </p>
                </div>
                <div className="sm:col-span-2">
                    <Label htmlFor="cp-amount">Amount (MXN)</Label>
                    <div className="relative mt-1.5">
                        <span
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                        >
                            $
                        </span>
                        <Input
                            id="cp-amount"
                            name="amount"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            required
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="pl-7"
                        />
                    </div>
                    {fullAmount !== null ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="mt-2 rounded-full"
                            onClick={() => setAmount(fullAmount.toFixed(2))}
                        >
                            Pay full {formatMxn(fullAmount)}
                        </Button>
                    ) : null}
                    {fieldError("amount")}
                </div>
            </div>

            <div>
                <Label htmlFor="cp-card">Card paid</Label>
                <Select
                    value={cardId}
                    onValueChange={(value) => setCardId(value ?? "")}
                >
                    <SelectTrigger
                        id="cp-card"
                        aria-label="Card paid"
                        className="mt-1.5 w-full"
                    >
                        {selectedCard ? (
                            <span className="flex items-center gap-2">
                                <span
                                    aria-hidden
                                    className="size-2.5 shrink-0 rounded-full"
                                    style={{
                                        backgroundColor: selectedCard.color,
                                    }}
                                />
                                {selectedCard.name}
                            </span>
                        ) : (
                            <span className="text-muted-foreground">
                                Select a card…
                            </span>
                        )}
                    </SelectTrigger>
                    <SelectContent>
                        {cards.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                <span className="flex items-center gap-2">
                                    <span
                                        aria-hidden
                                        className="size-2.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: c.color }}
                                    />
                                    {c.name}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {fieldError("cardId")}
            </div>

            <div>
                <Label htmlFor="cp-note">
                    Note{" "}
                    <span className="font-normal text-muted-foreground">
                        (optional)
                    </span>
                </Label>
                <Input
                    id="cp-note"
                    name="note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1.5"
                />
            </div>

            {/* A balance the payment will not reach has no "after": a date in
                another month withholds the preview, as a past month does. */}
            {selectedCard &&
            balance !== undefined &&
            balanceAfter !== null &&
            !outsideMonthNote ? (
                <div className="space-y-1.5">
                    <p className="flex items-center gap-2 rounded-lg bg-payment-tint px-3 py-2.5 text-sm tabular-nums">
                        <span>{selectedCard.name} balance</span>
                        <span className="ml-auto">
                            {formatBalance(balance)}
                        </span>
                        <span aria-hidden>→</span>
                        <span className="sr-only">after this payment</span>
                        <b>{formatBalance(balanceAfter)}</b>
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Cash you sent to the card. Your spending figures
                        don&apos;t change: the expenses were already counted
                        when you charged them.
                    </p>
                </div>
            ) : null}

            {formError && (
                <p className="text-sm text-destructive" role="alert">
                    {formError}
                </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                {onCancel ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={pending}
                    >
                        Cancel
                    </Button>
                ) : null}
                <Button type="submit" disabled={pending}>
                    {pending
                        ? "Saving…"
                        : payment
                          ? "Save changes"
                          : "Add card payment"}
                </Button>
            </div>
        </form>
    );
}

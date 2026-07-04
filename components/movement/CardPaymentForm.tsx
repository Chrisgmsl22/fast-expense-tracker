"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PARTNER_NAME } from "@/lib/partner";
import type { FieldErrors } from "@/lib/actions/result";
import type { CardPaymentInput } from "@/lib/schemas/movement";
import type { CardOption } from "@/components/expense/ExpenseForm";

type Props = {
    cards: CardOption[];
    onSuccess?: () => void;
    onCancel?: () => void;
};

/**
 * Log a card payment (ADR-0018): amount + which card + an optional
 * "paid with {partner}'s money" toggle. A card payment is a `Movement`, decoupled
 * from expenses — it never enters spend totals; the toggle draws down the
 * "{partner} owes you" reminder. Validation + persistence live in the action.
 */
export function CardPaymentForm({ cards, onSuccess, onCancel }: Props) {
    const [date, setDate] = useState("");
    const [amount, setAmount] = useState("");
    const [cardId, setCardId] = useState("");
    const [fundedByPartner, setFundedByPartner] = useState(false);
    const [note, setNote] = useState("");

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<CardPaymentInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const selectedCard = cards.find((c) => c.id === cardId);

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        startTransition(async () => {
            try {
                const res: AddCardPaymentResult = await addCardPayment({
                    date,
                    amount,
                    cardId,
                    fundedByPartner,
                    note: note || undefined,
                });
                if (res.ok) {
                    setErrors({});
                    setFormError(null);
                    form.reset();
                    setDate("");
                    setAmount("");
                    setCardId("");
                    setFundedByPartner(false);
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
            aria-label="Add card payment"
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
                    />
                    {fieldError("date")}
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

            <label className="flex items-start gap-2.5">
                <Checkbox
                    checked={fundedByPartner}
                    onCheckedChange={(checked) => setFundedByPartner(checked)}
                    aria-label={`Paid with ${PARTNER_NAME}'s money`}
                    className="mt-0.5 data-checked:border-payment data-checked:bg-payment"
                />
                <span className="text-sm">
                    <span className="block font-medium">
                        {`Paid with ${PARTNER_NAME}'s money`}
                    </span>
                    <span className="block text-muted-foreground">
                        {`Money ${PARTNER_NAME} sent you, passing straight through to the card.`}
                    </span>
                </span>
            </label>

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
                    {pending ? "Saving…" : "Add card payment"}
                </Button>
            </div>
        </form>
    );
}

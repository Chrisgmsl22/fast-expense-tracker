"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    addTransfer,
    type AddTransferResult,
} from "@/app/_actions/movement/add-transfer";
import {
    updateTransfer,
    type UpdateTransferResult,
} from "@/app/_actions/movement/update-transfer";
import { PARTNER_NAME } from "@/lib/partner";
import type { FieldErrors } from "@/lib/actions/result";
import type { TransferInput } from "@/lib/schemas/movement";

type Direction = "gf_paid" | "gf_received";

/** Prefilled fields when the form edits an existing transfer (strings for inputs). */
export type TransferEditable = {
    id: string;
    date: string;
    amount: string;
    note: string;
};

type Props = {
    /** `gf_paid` = "I paid {partner}"; `gf_received` = "{partner} paid me". */
    direction?: Direction;
    /** Prefills the amount (settlement quick-settle passes the net balance). */
    initialAmount?: string;
    /** When present, the form edits this transfer instead of creating one. */
    transfer?: TransferEditable;
    onSuccess?: () => void;
    onCancel?: () => void;
};

/**
 * Log a cash transfer with the partner (ADR-0018 + spec 0004). `direction` picks
 * the side: money you sent her (`gf_paid`) or money she sent you (`gf_received`,
 * settling what she owes). Just the amount you settled (netted in your head); no
 * category, no split — it's cash, not an expense.
 */
export function TransferForm({
    direction = "gf_paid",
    initialAmount = "",
    transfer,
    onSuccess,
    onCancel,
}: Props) {
    const [date, setDate] = useState(transfer?.date ?? "");
    const [amount, setAmount] = useState(transfer?.amount ?? initialAmount);
    const [note, setNote] = useState(transfer?.note ?? "");

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<TransferInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const inbound = direction === "gf_received";
    const blurb = inbound
        ? `Money ${PARTNER_NAME} sent you — settles what she owes you. Not an expense.`
        : `The amount you settled with ${PARTNER_NAME} — money out of your account, not an expense.`;
    const submitLabel = transfer
        ? "Save changes"
        : inbound
          ? `Log ${PARTNER_NAME}'s payment`
          : `Log payment to ${PARTNER_NAME}`;

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        startTransition(async () => {
            try {
                const res: AddTransferResult | UpdateTransferResult = transfer
                    ? await updateTransfer({
                          id: transfer.id,
                          date,
                          amount,
                          direction,
                          note: note || undefined,
                      })
                    : await addTransfer({
                          date,
                          amount,
                          direction,
                          note: note || undefined,
                      });
                if (res.ok) {
                    setErrors({});
                    setFormError(null);
                    form.reset();
                    setDate("");
                    setAmount("");
                    setNote("");
                    onSuccess?.();
                } else {
                    setErrors(res.fieldErrors ?? {});
                    setFormError(res.message);
                }
            } catch {
                setFormError("Something went wrong saving the transfer.");
            }
        });
    }

    const fieldError = (name: keyof TransferInput) => {
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
            aria-label={
                inbound
                    ? `Log money received from ${PARTNER_NAME}`
                    : `Log money sent to ${PARTNER_NAME}`
            }
        >
            <p className="text-sm text-muted-foreground">{blurb}</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                    <Label htmlFor="tr-date">Date</Label>
                    <Input
                        id="tr-date"
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
                    <Label htmlFor="tr-amount">Amount (MXN)</Label>
                    <div className="relative mt-1.5">
                        <span
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                        >
                            $
                        </span>
                        <Input
                            id="tr-amount"
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
                <Label htmlFor="tr-note">
                    Note{" "}
                    <span className="font-normal text-muted-foreground">
                        (optional)
                    </span>
                </Label>
                <Input
                    id="tr-note"
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
                    {pending ? "Saving…" : submitLabel}
                </Button>
            </div>
        </form>
    );
}

"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTransfer } from "@/app/_actions/movement/add-transfer";
import { updateTransfer } from "@/app/_actions/movement/update-transfer";
import { addPartnerPayment } from "@/app/_actions/expense/add-partner-payment";
import { updatePartnerPayment } from "@/app/_actions/expense/update-partner-payment";
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
    /**
     * Which table the row being edited lives in. A payment you sent is an
     * Expense (spec 0007 §6b), but a LEGACY `gf_paid` movement the migration
     * could not convert is still a movement — and routing an edit by direction
     * alone sends it to the expense action, which answers "not found" for a row
     * in plain sight. New rows are always expenses, hence the default.
     */
    source?: "expense" | "movement";
    partnerName: string;
    onSuccess?: () => void;
    onCancel?: () => void;
};

/**
 * Log a settlement transfer with the partner. `direction` picks the side, and
 * the two sides are no longer symmetric (spec 0007 §6b):
 *
 * - **you → her** is an `Expense{isPartnerPayment}` in Combined Expenses. Paying
 *   her is the moment the money is really spent, so it belongs in the budget.
 * - **her → you** stays a `Movement{gf_received}`. It is her cash settling what
 *   she owes you; nothing of yours was consumed.
 *
 * Either way the amount is the figure you settled, netted in your head; no split
 * is applied to it.
 */
export function TransferForm({
    direction = "gf_paid",
    initialAmount = "",
    transfer,
    source = "expense",
    partnerName,
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
    // "I paid {partner}" — the half that becomes an expense.
    const outbound = !inbound;
    const blurb = inbound
        ? `Money ${partnerName} sent you — settles what she owes you. Not an expense.`
        : `Money you sent ${partnerName} — this IS your expense, counted in your budget under Combined Expenses.`;
    const submitLabel = transfer
        ? "Save changes"
        : inbound
          ? `Log ${partnerName}'s payment`
          : `Log payment to ${partnerName}`;

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        startTransition(async () => {
            try {
                // Money you SEND her is an expense (spec 0007 §6b) — the only
                // half of a settlement that is real spending of yours. Money she
                // sends you stays a movement: it is her cash, not your purchase.
                const res =
                    outbound && source === "expense"
                        ? transfer
                            ? await updatePartnerPayment({
                                  id: transfer.id,
                                  date,
                                  amount,
                                  note: note || undefined,
                              })
                            : await addPartnerPayment({
                                  date,
                                  amount,
                                  note: note || undefined,
                              })
                        : transfer
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
                    ? `Log money received from ${partnerName}`
                    : `Log money sent to ${partnerName}`
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

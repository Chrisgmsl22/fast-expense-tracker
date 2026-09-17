"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    FUNDING_TOGGLE_LABEL,
    type TransferFundingSource,
} from "@/lib/domain/funding";
import { addTransfer } from "@/app/_actions/movement/add-transfer";
import { updateTransfer } from "@/app/_actions/movement/update-transfer";
import { addPartnerPayment } from "@/app/_actions/expense/add-partner-payment";
import { updatePartnerPayment } from "@/app/_actions/expense/update-partner-payment";
import type { FieldErrors } from "@/lib/actions/result";
import type { TransferInput } from "@/lib/schemas/movement";

type Direction = "gf_paid" | "gf_received";

/** Static ids: one transfer form is mounted at a time. */
const SAVINGS_LABEL_ID = "transfer-savings-label";
const SAVINGS_HINT_ID = "transfer-savings-hint";

/** Prefilled fields when the form edits an existing transfer (strings for inputs). */
export type TransferEditable = {
    id: string;
    date: string;
    amount: string;
    note: string;
    fundedFrom: TransferFundingSource;
};

type Props = {
    /** `gf_paid` = "I paid {partner}"; `gf_received` = "{partner} paid me". */
    direction?: Direction;
    /** Prefills the amount (settlement quick-settle passes the net balance). */
    initialAmount?: string;
    /** When present, the form edits this transfer instead of creating one. */
    transfer?: TransferEditable;
    /**
     * Which table the row being edited lives in. A LEGACY `gf_paid` row is still a
     * movement (conversion deferred), so routing an edit by direction alone answers
     * "not found" for a row in plain sight. New rows are always expenses.
     */
    source?: "expense" | "movement";
    partnerName: string;
    onSuccess?: () => void;
    onCancel?: () => void;
};

/**
 * Log a settlement transfer. The two sides are not symmetric (spec 0007 §6b): you →
 * her is an `Expense{isPartnerPayment}` in Combined Expenses; her → you stays a
 * `Movement{gf_received}`. No split is applied to either.
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
    const [fundedFrom, setFundedFrom] = useState<TransferFundingSource>(
        transfer?.fundedFrom ?? "income",
    );

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<TransferInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const inbound = direction === "gf_received";
    const outbound = !inbound;
    const blurb = inbound
        ? `Money ${partnerName} sent you — settles what she owes you. Not an expense.`
        : `Money you sent ${partnerName} — this IS your expense, counted in your budget under Combined Expenses.`;
    const submitLabel = transfer
        ? "Save changes"
        : inbound
          ? `Log ${partnerName}'s payment`
          : `Log payment to ${partnerName}`;

    // Inbound money is funded by nothing of yours, so the control is hidden and
    // `income` is sent — which also clears the tag when an outbound transfer is
    // flipped inbound.
    const outboundFundedFrom: TransferFundingSource = inbound
        ? "income"
        : fundedFrom;

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        startTransition(async () => {
            try {
                const res =
                    outbound && source === "expense"
                        ? transfer
                            ? await updatePartnerPayment({
                                  id: transfer.id,
                                  date,
                                  amount,
                                  note: note || undefined,
                                  fundedFrom: outboundFundedFrom,
                              })
                            : await addPartnerPayment({
                                  date,
                                  amount,
                                  note: note || undefined,
                                  fundedFrom: outboundFundedFrom,
                              })
                        : transfer
                          ? await updateTransfer({
                                id: transfer.id,
                                date,
                                amount,
                                direction,
                                note: note || undefined,
                                fundedFrom: outboundFundedFrom,
                            })
                          : await addTransfer({
                                date,
                                amount,
                                direction,
                                note: note || undefined,
                                fundedFrom: outboundFundedFrom,
                            });
                if (res.ok) {
                    setErrors({});
                    setFormError(null);
                    form.reset();
                    setDate("");
                    setAmount("");
                    setNote("");
                    // Only when creating: an edit form that stayed mounted would
                    // show `income` over a row it just saved as savings-funded.
                    if (!transfer) setFundedFrom("income");
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

            {/* Outbound only, and no `reimbursed`: that is Health-only and a
                transfer has no category (spec 0007 §3.1, §3.3). */}
            {/* Named by the visible text, described by the hint outside the
                label; the description is pointed at only while the hint renders. */}
            {inbound ? null : (
                <div>
                    <label className="flex items-start gap-2.5">
                        <Checkbox
                            checked={fundedFrom === "savings"}
                            onCheckedChange={(checked) =>
                                setFundedFrom(
                                    checked === true ? "savings" : "income",
                                )
                            }
                            aria-labelledby={SAVINGS_LABEL_ID}
                            aria-describedby={
                                fundedFrom === "savings"
                                    ? SAVINGS_HINT_ID
                                    : undefined
                            }
                            className="mt-0.5"
                        />
                        <span
                            id={SAVINGS_LABEL_ID}
                            className="text-sm font-medium"
                        >
                            {FUNDING_TOGGLE_LABEL.savings}
                        </span>
                    </label>
                    {fundedFrom === "savings" ? (
                        <p
                            id={SAVINGS_HINT_ID}
                            className="pl-[1.625rem] text-sm text-muted-foreground"
                        >
                            Doesn&apos;t count toward this month&apos;s budget
                            or what you really spent. It still settles what you
                            owe {partnerName}.
                        </p>
                    ) : null}
                </div>
            )}

            {/* Outside the branch above: an inbound transfer hides the control
                but can still be rejected for its funding source, and that
                message has to land somewhere the user can see it. */}
            {fieldError("fundedFrom")}

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

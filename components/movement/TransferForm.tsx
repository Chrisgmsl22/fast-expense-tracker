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
import {
    addTransfer,
    type AddTransferResult,
} from "@/app/_actions/movement/add-transfer";
import {
    updateTransfer,
    type UpdateTransferResult,
} from "@/app/_actions/movement/update-transfer";
import type { FieldErrors } from "@/lib/actions/result";
import type { TransferInput } from "@/lib/schemas/movement";

type Direction = "gf_paid" | "gf_received";

/** Ids the savings checkbox names and describes itself by (one form mounts at a time). */
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
    partnerName: string;
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
    partnerName,
    onSuccess,
    onCancel,
}: Props) {
    const [date, setDate] = useState(transfer?.date ?? "");
    const [amount, setAmount] = useState(transfer?.amount ?? initialAmount);
    const [note, setNote] = useState(transfer?.note ?? "");
    // Which month's money funded it (spec 0007 §3.1). `income` is the default
    // and the path of least effort: ignore the control and nothing changes.
    const [fundedFrom, setFundedFrom] = useState<TransferFundingSource>(
        transfer?.fundedFrom ?? "income",
    );

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<TransferInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const inbound = direction === "gf_received";
    const blurb = inbound
        ? `Money ${partnerName} sent you — settles what she owes you. Not an expense.`
        : `The amount you settled with ${partnerName} — money out of your account, not an expense.`;
    const submitLabel = transfer
        ? "Save changes"
        : inbound
          ? `Log ${partnerName}'s payment`
          : `Log payment to ${partnerName}`;

    // Money coming IN from her is funded by nothing of yours, so the control is
    // hidden for that direction and the value sent is always the neutral
    // default — which also clears the tag if an outbound transfer is flipped
    // inbound, rather than stranding it.
    const outboundFundedFrom: TransferFundingSource = inbound
        ? "income"
        : fundedFrom;

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
                    // Only when creating. An edit form that stayed mounted
                    // would otherwise show `income` over a row it just saved
                    // as savings-funded.
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

            {/* Funding source (spec 0007 §3.1 + §6a decision 5). Same wording as
                an expense's control, minus `reimbursed` — that one is Health-only
                (§3.3) and a transfer has no category. Outbound only: money she
                sends you isn't funded by anything of yours. */}
            {/* Named by its visible text, described by the hint — which sits
                outside the label so it is announced as a description instead of
                being swallowed by the checkbox's accessible name. The
                description is pointed at only while the hint is rendered, so the
                unticked default never references a missing id. */}
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

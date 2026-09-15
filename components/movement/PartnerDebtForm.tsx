"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    addFrontedExpense,
    type AddFrontedExpenseResult,
} from "@/app/_actions/expense/add-fronted";
import {
    updateFrontedExpense,
    type UpdateFrontedExpenseResult,
} from "@/app/_actions/expense/update-fronted";
import type { FieldErrors } from "@/lib/actions/result";
import type { FrontedExpenseInput } from "@/lib/schemas/expense";

/** Prefilled fields when the form edits an existing debt (strings for inputs). */
export type PartnerDebtEditable = {
    id: string;
    date: string;
    amount: string;
    note: string;
};

type Props = {
    /** When present, the form edits this debt instead of creating a new one. */
    debt?: PartnerDebtEditable;
    partnerName: string;
    onSuccess?: () => void;
    onCancel?: () => void;
};

/**
 * Log an "I owe {partner}" debt — something she fronted that you owe her back
 * (spec 0007 §6a). It is saved as an `Expense{isFronted:true}`, so it counts in
 * your categories and buckets: it is real consumption from this month's income.
 * It stays out of spend-by-card and the cash figure, because no money of yours
 * moved yet — the transfer that settles it is the cash event.
 *
 * The amount is **what you owe**, not what she paid, so there is no split to
 * enter. It files itself under Combined Expenses → "Covered for me"; change
 * either from the expense row afterwards.
 */
export function PartnerDebtForm({
    debt,
    partnerName,
    onSuccess,
    onCancel,
}: Props) {
    const [date, setDate] = useState(debt?.date ?? "");
    const [amount, setAmount] = useState(debt?.amount ?? "");
    const [note, setNote] = useState(debt?.note ?? "");

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<FrontedExpenseInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        startTransition(async () => {
            try {
                const res:
                    | AddFrontedExpenseResult
                    | UpdateFrontedExpenseResult = debt
                    ? await updateFrontedExpense({
                          id: debt.id,
                          date,
                          amount,
                          note: note || undefined,
                      })
                    : await addFrontedExpense({
                          date,
                          amount,
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
                setFormError("Something went wrong saving the debt.");
            }
        });
    }

    const fieldError = (name: keyof FrontedExpenseInput) => {
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
                debt
                    ? `Edit a debt you owe ${partnerName}`
                    : `Log a debt you owe ${partnerName}`
            }
        >
            <p className="text-sm text-muted-foreground">
                {`Something ${partnerName} fronted that you owe her back. Enter what YOU owe, not what she paid. It counts in your budget under Combined Expenses, and it adds to what you owe her until a transfer settles it.`}
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                    <Label htmlFor="debt-date">Date</Label>
                    <Input
                        id="debt-date"
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
                    <Label htmlFor="debt-amount">Amount you owe (MXN)</Label>
                    <div className="relative mt-1.5">
                        <span
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                        >
                            $
                        </span>
                        <Input
                            id="debt-amount"
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
                <Label htmlFor="debt-note">
                    Note{" "}
                    <span className="font-normal text-muted-foreground">
                        (optional)
                    </span>
                </Label>
                <Input
                    id="debt-note"
                    name="note"
                    type="text"
                    placeholder={`I owe ${partnerName}`}
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
                    {pending ? "Saving…" : debt ? "Save changes" : "Log debt"}
                </Button>
            </div>
        </form>
    );
}

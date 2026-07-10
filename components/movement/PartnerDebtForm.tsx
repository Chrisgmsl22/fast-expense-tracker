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
    addPartnerDebt,
    type AddPartnerDebtResult,
} from "@/app/_actions/movement/add-partner-debt";
import {
    updatePartnerDebt,
    type UpdatePartnerDebtResult,
} from "@/app/_actions/movement/update-partner-debt";
import type { CategoryOption } from "@/components/expense/ExpenseForm";
import { PARTNER_NAME } from "@/lib/partner";
import type { FieldErrors } from "@/lib/actions/result";
import type { PartnerDebtInput } from "@/lib/schemas/movement";

/** Prefilled fields when the form edits an existing debt (strings for inputs). */
export type PartnerDebtEditable = {
    id: string;
    date: string;
    amount: string;
    categoryId: string;
    note: string;
};

type Props = {
    categories: CategoryOption[];
    /** Preselected category (the settlement page passes its first essentials category). */
    defaultCategoryId?: string;
    /** When present, the form edits this debt instead of creating a new one. */
    debt?: PartnerDebtEditable;
    onSuccess?: () => void;
    onCancel?: () => void;
};

/**
 * Log an "I owe {partner}" debt — your share of shared things she fronted (spec
 * 0004). It's cost, not cash: it's saved as an `Expense{paidBy:"gf"}` in a
 * category, so it feeds "What I really spent" + its bucket, and the settlement
 * balance reads it as the "you owe her" side. Logged only from the settlement page.
 */
export function PartnerDebtForm({
    categories,
    defaultCategoryId = "",
    debt,
    onSuccess,
    onCancel,
}: Props) {
    const [date, setDate] = useState(debt?.date ?? "");
    const [amount, setAmount] = useState(debt?.amount ?? "");
    const [categoryId, setCategoryId] = useState(
        debt?.categoryId ?? defaultCategoryId,
    );
    const [note, setNote] = useState(debt?.note ?? "");

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<PartnerDebtInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const selectedCategory = categories.find((c) => c.id === categoryId);

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        startTransition(async () => {
            try {
                const res: AddPartnerDebtResult | UpdatePartnerDebtResult = debt
                    ? await updatePartnerDebt({
                          id: debt.id,
                          date,
                          amount,
                          categoryId,
                          note: note || undefined,
                      })
                    : await addPartnerDebt({
                          date,
                          amount,
                          categoryId,
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

    const fieldError = (name: keyof PartnerDebtInput) => {
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
                    ? `Edit a debt you owe ${PARTNER_NAME}`
                    : `Log a debt you owe ${PARTNER_NAME}`
            }
        >
            <p className="text-sm text-muted-foreground">
                {`Your share of shared things ${PARTNER_NAME} paid for. It counts as what you spent and adds to what you owe her — settle it with a transfer.`}
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
                <Label htmlFor="debt-category">Category</Label>
                <Select
                    value={categoryId}
                    onValueChange={(value) => setCategoryId(value ?? "")}
                >
                    <SelectTrigger
                        id="debt-category"
                        aria-label="Category"
                        className="mt-1.5 w-full"
                    >
                        {selectedCategory ? (
                            <span className="flex items-center gap-2">
                                <span
                                    aria-hidden
                                    className="size-2.5 shrink-0 rounded-full"
                                    style={{
                                        backgroundColor: selectedCategory.color,
                                    }}
                                />
                                {selectedCategory.name}
                            </span>
                        ) : (
                            <span className="text-muted-foreground">
                                Select a category…
                            </span>
                        )}
                    </SelectTrigger>
                    <SelectContent>
                        {categories.map((c) => (
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
                {fieldError("categoryId")}
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
                    placeholder={`I owe ${PARTNER_NAME}`}
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

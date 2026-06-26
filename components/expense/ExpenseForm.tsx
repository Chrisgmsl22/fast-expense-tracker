"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
    createExpense,
    type CreateExpenseResult,
} from "@/app/_actions/expense/create";
import {
    updateExpense,
    type UpdateExpenseResult,
} from "@/app/_actions/expense/update";
import { toDateInputValue } from "@/lib/dates";
import type { FieldErrors } from "@/lib/actions/result";
import type { ExpenseInput } from "@/lib/schemas/expense";
import type { ExpenseEditable } from "@/lib/services/expense/expense.service";

export type CategoryOption = { id: string; name: string };
export type SubcategoryOption = {
    id: string;
    name: string;
    categoryId: string;
};
export type CardOption = { id: string; name: string };

type Props = {
    categories: CategoryOption[];
    subcategories: SubcategoryOption[];
    cards: CardOption[];
    /** When present, the form edits this expense instead of creating one. */
    expense?: ExpenseEditable;
    onSuccess?: () => void;
};

/**
 * Expense capture/edit form. Uncontrolled inputs read via
 * FormData on submit; only `isShared` is stateful (it reveals the share field).
 * Validation + the actualExpenditure math live server-side — this surfaces the
 * field errors the action returns. With an `expense` prop it updates that row;
 * without, it creates a new one.
 */
export function ExpenseForm({
    categories,
    subcategories,
    cards,
    expense,
    onSuccess,
}: Props) {
    const isEdit = expense !== undefined;
    const [isShared, setIsShared] = useState(expense?.isShared ?? false);
    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<ExpenseInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const input = {
            date: String(fd.get("date") ?? ""),
            amount: String(fd.get("amount") ?? ""),
            categoryId: String(fd.get("categoryId") ?? ""),
            subcategoryId: (fd.get("subcategoryId") as string) || undefined,
            cardId: (fd.get("cardId") as string) || undefined,
            description: String(fd.get("description") ?? ""),
            notes: (fd.get("notes") as string) || undefined,
            isShared,
            yourPercentage: String(fd.get("yourPercentage") ?? "1"),
            paidBy: String(fd.get("paidBy") ?? "you"),
        };
        startTransition(async () => {
            try {
                const res: CreateExpenseResult | UpdateExpenseResult = isEdit
                    ? await updateExpense({ id: expense.id, ...input })
                    : await createExpense(input);
                if (res.ok) {
                    setErrors({});
                    setFormError(null);
                    // On create, clear for the next entry; on edit, the modal closes.
                    if (!isEdit) {
                        form.reset();
                        setIsShared(false);
                    }
                    onSuccess?.();
                } else {
                    setErrors(res.fieldErrors ?? {});
                    setFormError(res.message);
                }
            } catch {
                setFormError("Something went wrong saving the expense.");
            }
        });
    }

    const fieldError = (name: keyof ExpenseInput) => {
        const msg = errors[name]?.[0];
        return msg ? (
            <p className="mt-1 text-sm text-red-600" role="alert">
                {msg}
            </p>
        ) : null;
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            aria-label={isEdit ? "Edit expense" : "Add expense"}
        >
            <div>
                <label htmlFor="date" className="block text-sm font-medium">
                    Date
                </label>
                <input
                    id="date"
                    name="date"
                    type="date"
                    required
                    defaultValue={
                        expense ? toDateInputValue(expense.date) : undefined
                    }
                    className="w-full rounded border p-2"
                />
                {fieldError("date")}
            </div>

            <div>
                <label htmlFor="amount" className="block text-sm font-medium">
                    Amount (MXN)
                </label>
                <input
                    id="amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={expense?.amount}
                    className="w-full rounded border p-2"
                />
                {fieldError("amount")}
            </div>

            <div>
                <label
                    htmlFor="categoryId"
                    className="block text-sm font-medium"
                >
                    Category
                </label>
                <select
                    id="categoryId"
                    name="categoryId"
                    required
                    defaultValue={expense?.categoryId ?? ""}
                    className="w-full rounded border p-2"
                >
                    <option value="">Select a category…</option>
                    {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
                {fieldError("categoryId")}
            </div>

            <div>
                <label
                    htmlFor="subcategoryId"
                    className="block text-sm font-medium"
                >
                    Subcategory (optional)
                </label>
                <select
                    id="subcategoryId"
                    name="subcategoryId"
                    defaultValue={expense?.subcategoryId ?? ""}
                    className="w-full rounded border p-2"
                >
                    <option value="">None</option>
                    {subcategories.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label htmlFor="cardId" className="block text-sm font-medium">
                    Card
                </label>
                <select
                    id="cardId"
                    name="cardId"
                    defaultValue={expense?.cardId ?? ""}
                    className="w-full rounded border p-2"
                >
                    <option value="">Cash</option>
                    {cards.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label
                    htmlFor="description"
                    className="block text-sm font-medium"
                >
                    Description
                </label>
                <input
                    id="description"
                    name="description"
                    type="text"
                    required
                    defaultValue={expense?.description}
                    className="w-full rounded border p-2"
                />
                {fieldError("description")}
            </div>

            <div>
                <label htmlFor="notes" className="block text-sm font-medium">
                    Notes (optional)
                </label>
                <textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    defaultValue={expense?.notes ?? ""}
                    className="w-full rounded border p-2"
                />
            </div>

            <div>
                <label htmlFor="paidBy" className="block text-sm font-medium">
                    Paid by
                </label>
                <select
                    id="paidBy"
                    name="paidBy"
                    defaultValue={expense?.paidBy ?? "you"}
                    className="w-full rounded border p-2"
                >
                    <option value="you">You</option>
                    <option value="gf">Girlfriend</option>
                </select>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium">
                <input
                    name="isShared"
                    type="checkbox"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                />
                Shared expense
            </label>

            {isShared && (
                <div>
                    <label
                        htmlFor="yourPercentage"
                        className="block text-sm font-medium"
                    >
                        Your share (0–1, e.g. 0.7)
                    </label>
                    <input
                        id="yourPercentage"
                        name="yourPercentage"
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        defaultValue={expense?.yourPercentage ?? 0.7}
                        className="w-full rounded border p-2"
                    />
                    {fieldError("yourPercentage")}
                </div>
            )}

            {formError && (
                <p className="text-sm text-red-600" role="alert">
                    {formError}
                </p>
            )}

            <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
            </Button>
        </form>
    );
}

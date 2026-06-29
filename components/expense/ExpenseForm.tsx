"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
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
    createExpense,
    type CreateExpenseResult,
} from "@/app/_actions/expense/create";
import {
    updateExpense,
    type UpdateExpenseResult,
} from "@/app/_actions/expense/update";
import { toDateInputValue } from "@/lib/dates";
import { formatMxn } from "@/lib/format";
import type { FieldErrors } from "@/lib/actions/result";
import type { ExpenseInput } from "@/lib/schemas/expense";
import type { ExpenseEditable } from "@/lib/repositories/expense.repository";

export type CategoryOption = { id: string; name: string; color: string };
export type SubcategoryOption = {
    id: string;
    name: string;
    categoryId: string;
};
export type CardOption = { id: string; name: string; color: string };

type Props = {
    categories: CategoryOption[];
    subcategories: SubcategoryOption[];
    cards: CardOption[];
    /** The user's configured income-ratio split (Settings.defaultSharePercentage). */
    defaultSharePercentage: number;
    /** When present, the form edits this expense instead of creating one. */
    expense?: ExpenseEditable;
    onSuccess?: () => void;
    /** Dismiss the surrounding modal (the design's Cancel button). */
    onCancel?: () => void;
};

/** A colored dot + label, used in select triggers and items. */
function Dotted({ color, children }: { color: string; children: string }) {
    return (
        <span className="flex items-center gap-2">
            <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
            />
            {children}
        </span>
    );
}

/**
 * Expense capture/edit form, re-skinned to Confirmed designs V1.
 *
 * Fully controlled: the Base UI selects, the amount, and the shared toggle drive
 * React state, which lets the subcategory list cascade from the chosen category
 * and the "your share" figure update live. Validation + the actualExpenditure
 * math still live server-side — this only surfaces the field errors the action
 * returns. With an `expense` prop it updates that row (preserving the stored
 * `yourPercentage` so historical splits don't shift); without, it creates one.
 */
export function ExpenseForm({
    categories,
    subcategories,
    cards,
    defaultSharePercentage,
    expense,
    onSuccess,
    onCancel,
}: Props) {
    const isEdit = expense !== undefined;
    const [date, setDate] = useState(
        expense ? toDateInputValue(expense.date) : "",
    );
    const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
    const [categoryId, setCategoryId] = useState(expense?.categoryId ?? "");
    const [subcategoryId, setSubcategoryId] = useState(
        expense?.subcategoryId ?? "",
    );
    const [cardId, setCardId] = useState(expense?.cardId ?? "");
    const [description, setDescription] = useState(expense?.description ?? "");
    const [notes, setNotes] = useState(expense?.notes ?? "");
    const [paidBy, setPaidBy] = useState(expense?.paidBy ?? "you");
    const [isShared, setIsShared] = useState(expense?.isShared ?? false);
    // An already-shared row keeps its stored split so historical splits stay
    // correct (CLAUDE.md domain note). Everything else — a new expense, or an
    // unshared row being newly marked shared — uses the configured split. An
    // unshared row stores yourPercentage = 1, which would fail the "shared needs
    // < 100%" rule if carried over, so it must never be the shared value.
    const yourPercentage =
        expense?.isShared && expense.yourPercentage < 1
            ? expense.yourPercentage
            : defaultSharePercentage;

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<ExpenseInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const availableSubcategories = useMemo(
        () => subcategories.filter((s) => s.categoryId === categoryId),
        [subcategories, categoryId],
    );

    const selectedCategory = categories.find((c) => c.id === categoryId);
    const selectedSubcategory = availableSubcategories.find(
        (s) => s.id === subcategoryId,
    );
    const selectedCard = cards.find((c) => c.id === cardId);

    const amountNumber = Number.parseFloat(amount);
    const yourShare = Number.isFinite(amountNumber)
        ? amountNumber * yourPercentage
        : 0;
    const yourPct = Math.round(yourPercentage * 100);
    const partnerPct = 100 - yourPct;

    function handleCategoryChange(value: string) {
        setCategoryId(value);
        // A subcategory belongs to one category; drop it when it no longer fits.
        const stillValid = subcategories.some(
            (s) => s.id === subcategoryId && s.categoryId === value,
        );
        if (!stillValid) setSubcategoryId("");
    }

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const input = {
            date,
            amount,
            categoryId,
            subcategoryId: subcategoryId || undefined,
            cardId: cardId || undefined,
            description,
            notes: notes || undefined,
            isShared,
            yourPercentage: String(yourPercentage),
            paidBy,
        };
        startTransition(async () => {
            try {
                const res: CreateExpenseResult | UpdateExpenseResult = isEdit
                    ? await updateExpense({ id: expense.id, ...input })
                    : await createExpense(input);
                if (res.ok) {
                    setErrors({});
                    setFormError(null);
                    if (!isEdit) {
                        form.reset();
                        setDate("");
                        setAmount("");
                        setCategoryId("");
                        setSubcategoryId("");
                        setCardId("");
                        setDescription("");
                        setNotes("");
                        setPaidBy("you");
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
            <p className="mt-1 text-sm text-destructive" role="alert">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                    <Label htmlFor="date">Date</Label>
                    <Input
                        id="date"
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
                    <Label htmlFor="amount">Amount (MXN)</Label>
                    <div className="relative mt-1.5">
                        <span
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xl font-semibold text-muted-foreground"
                        >
                            $
                        </span>
                        <Input
                            id="amount"
                            name="amount"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            required
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="h-12 pl-8 text-xl font-semibold"
                        />
                    </div>
                    {fieldError("amount")}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                    <Label htmlFor="categoryId">Category</Label>
                    <Select
                        value={categoryId}
                        onValueChange={(value) =>
                            handleCategoryChange(value ?? "")
                        }
                    >
                        <SelectTrigger
                            id="categoryId"
                            aria-label="Category"
                            className="mt-1.5 w-full"
                        >
                            {selectedCategory ? (
                                <Dotted color={selectedCategory.color}>
                                    {selectedCategory.name}
                                </Dotted>
                            ) : (
                                <span className="text-muted-foreground">
                                    Select a category…
                                </span>
                            )}
                        </SelectTrigger>
                        <SelectContent>
                            {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                    <Dotted color={c.color}>{c.name}</Dotted>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {fieldError("categoryId")}
                </div>

                <div>
                    <Label htmlFor="subcategoryId">
                        Subcategory
                        {selectedCategory ? (
                            <span className="font-normal text-muted-foreground">
                                {" "}
                                (from {selectedCategory.name})
                            </span>
                        ) : null}
                    </Label>
                    <Select
                        value={subcategoryId}
                        onValueChange={(value) => setSubcategoryId(value ?? "")}
                        disabled={!categoryId}
                    >
                        <SelectTrigger
                            id="subcategoryId"
                            aria-label="Subcategory"
                            className="mt-1.5 w-full"
                        >
                            {selectedSubcategory ? (
                                selectedSubcategory.name
                            ) : (
                                <span className="text-muted-foreground">
                                    {categoryId ? "None" : "Pick a category"}
                                </span>
                            )}
                        </SelectTrigger>
                        <SelectContent>
                            {availableSubcategories.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="cardId">Card</Label>
                    <Select
                        value={cardId}
                        onValueChange={(value) => setCardId(value ?? "")}
                    >
                        <SelectTrigger
                            id="cardId"
                            aria-label="Card"
                            className="mt-1.5 w-full"
                        >
                            {selectedCard ? (
                                <Dotted color={selectedCard.color}>
                                    {selectedCard.name}
                                </Dotted>
                            ) : (
                                <span className="text-muted-foreground">
                                    Select a card…
                                </span>
                            )}
                        </SelectTrigger>
                        <SelectContent>
                            {cards.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                    <Dotted color={c.color}>{c.name}</Dotted>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div>
                <Label htmlFor="description">Description</Label>
                <Input
                    id="description"
                    name="description"
                    type="text"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1.5"
                />
                {fieldError("description")}
            </div>

            <div>
                <Label htmlFor="notes">
                    Notes{" "}
                    <span className="font-normal text-muted-foreground">
                        (optional)
                    </span>
                </Label>
                <textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1.5 flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
            </div>

            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                <div>
                    <Label htmlFor="paidBy">Paid by</Label>
                    <Select
                        value={paidBy}
                        onValueChange={(value) => setPaidBy(value ?? "you")}
                    >
                        <SelectTrigger
                            id="paidBy"
                            aria-label="Paid by"
                            className="mt-1.5 w-full"
                        >
                            {paidBy === "gf" ? "Girlfriend" : "You"}
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="you">You</SelectItem>
                            <SelectItem value="gf">Girlfriend</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="sm:mt-7">
                    <label className="flex items-start gap-2.5">
                        <Checkbox
                            checked={isShared}
                            onCheckedChange={(checked) => setIsShared(checked)}
                            aria-label="Shared expense"
                            className="mt-0.5 data-checked:border-positive data-checked:bg-positive"
                        />
                        <span className="text-sm">
                            <span className="block font-medium">
                                {`Shared expense · ${yourPct}/${partnerPct}`}
                            </span>
                            {isShared ? (
                                <span className="block text-positive">
                                    {`your share ${formatMxn(yourShare)}`}
                                </span>
                            ) : null}
                        </span>
                    </label>
                    {fieldError("yourPercentage")}
                </div>
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
                    {pending
                        ? "Saving…"
                        : isEdit
                          ? "Save changes"
                          : "Add expense"}
                </Button>
            </div>
        </form>
    );
}

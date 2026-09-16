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
import { SAVINGS_SLUG } from "@/lib/domain/dashboard";
import {
    FUNDING_TOGGLE_HINT,
    FUNDING_TOGGLE_LABEL,
    allowsReimbursed,
    fundingSourceAfterCategoryChange,
    fundingSourceFromToggles,
    togglesFromFundingSource,
    type FundingSource,
} from "@/lib/domain/funding";
import { toDateInputValue } from "@/lib/dates";
import { formatMxn } from "@/lib/format";
import type { FieldErrors } from "@/lib/actions/result";
import type { ExpenseInput } from "@/lib/schemas/expense";
import type { ExpenseEditable } from "@/lib/repositories/expense.repository";

export type CategoryOption = {
    id: string;
    slug: string;
    name: string;
    color: string;
};
export type SubcategoryOption = {
    id: string;
    name: string;
    categoryId: string;
};
export type CardOption = { id: string; name: string; color: string };

/** Ids the funding checkboxes name and describe themselves by (one form mounts at a time). */
const SAVINGS_LABEL_ID = "funding-savings-label";
const SAVINGS_HINT_ID = "funding-savings-hint";
const REIMBURSED_LABEL_ID = "funding-reimbursed-label";
const REIMBURSED_HINT_ID = "funding-reimbursed-hint";

type Props = {
    categories: CategoryOption[];
    subcategories: SubcategoryOption[];
    cards: CardOption[];
    /** The user's configured income-ratio split (Settings.defaultSharePercentage). */
    defaultSharePercentage: number;
    /**
     * Whether the user is in shared-expense mode (Settings.sharesExpenses). In
     * Solo mode (`false`) the split control is hidden and a new expense saves at
     * 100% mine (`isShared:false`, `yourPercentage:1`).
     */
    sharesExpenses: boolean;
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
    sharesExpenses,
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
    const [isShared, setIsShared] = useState(expense?.isShared ?? false);
    // Which month's money funded this (spec 0007 §3.1). `income` is the default
    // and the path of least effort: ignore the control and nothing changes.
    const [fundedFrom, setFundedFrom] = useState<FundingSource>(
        expense?.fundedFrom ?? "income",
    );
    // Set when a category change drops `reimbursed`, so the form can explain
    // where the choice went instead of silently changing it.
    const [reimbursedClearedBy, setReimbursedClearedBy] = useState<
        string | null
    >(null);
    // An already-shared row keeps its stored split so historical splits stay
    // correct (CLAUDE.md domain note + immutable history, ADR-0021) — even in
    // Solo mode, editing a historical shared row must not rewrite its split.
    // Everything else — a new expense, or an unshared row being newly marked
    // shared — uses the configured split in Shared mode, but 100% mine in Solo
    // mode (no split exists). An unshared row stores yourPercentage = 1, which
    // would fail the "shared needs < 100%" rule if carried over, so it must
    // never be the shared value.
    const yourPercentage =
        expense?.isShared && expense.yourPercentage < 1
            ? expense.yourPercentage
            : sharesExpenses
              ? defaultSharePercentage
              : 1;

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<ExpenseInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const availableSubcategories = useMemo(
        () => subcategories.filter((s) => s.categoryId === categoryId),
        [subcategories, categoryId],
    );

    const selectedCategory = categories.find((c) => c.id === categoryId);
    // Savings is a transfer, not a card purchase — no payment method applies.
    const isSavings = selectedCategory?.slug === SAVINGS_SLUG;
    const selectedSubcategory = availableSubcategories.find(
        (s) => s.id === subcategoryId,
    );
    const selectedCard = cards.find((c) => c.id === cardId);
    // `reimbursed` is offered only on Health (spec 0007 §3.3).
    const canReimburse = allowsReimbursed(selectedCategory?.slug ?? null);
    const toggles = togglesFromFundingSource(fundedFrom);
    /** Two mutually exclusive booleans in, one stored enum value out. */
    function setFunding(paidFromSavings: boolean, fullyReimbursed: boolean) {
        setFundedFrom(
            fundingSourceFromToggles(paidFromSavings, fullyReimbursed),
        );
        setReimbursedClearedBy(null);
    }

    const amountNumber = Number.parseFloat(amount);
    const yourShare = Number.isFinite(amountNumber)
        ? amountNumber * yourPercentage
        : 0;
    const yourPct = Math.round(yourPercentage * 100);
    const partnerPct = 100 - yourPct;

    function handleCategoryChange(value: string) {
        setCategoryId(value);
        // `reimbursed` is Health-only (spec 0007 §3.3). Leaving it selected on
        // another category would fail server-side validation, so drop back to
        // the default rather than let the user submit a doomed form.
        const next = categories.find((c) => c.id === value);
        const nextFunding = fundingSourceAfterCategoryChange(
            fundedFrom,
            next?.slug ?? null,
        );
        setFundedFrom(nextFunding);
        setReimbursedClearedBy(
            nextFunding === fundedFrom ? null : (next?.name ?? null),
        );
        // A subcategory belongs to one category; drop it when it no longer fits.
        const stillValid = subcategories.some(
            (s) => s.id === subcategoryId && s.categoryId === value,
        );
        if (!stillValid) setSubcategoryId("");
        // Savings has no card — clear any selected card when switching to it.
        if (next?.slug === SAVINGS_SLUG) setCardId("");
    }

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const input = {
            date,
            amount,
            categoryId,
            subcategoryId: subcategoryId || undefined,
            // Savings is a transfer — force no card, even when editing a legacy
            // savings row that still carries one (the field is disabled).
            cardId: isSavings ? undefined : cardId || undefined,
            description,
            notes: notes || undefined,
            isShared,
            yourPercentage: String(yourPercentage),
            fundedFrom,
            // Every expense is the user's (ADR-0018); `paidBy` defaults "you"
            // in the schema, so the form no longer sends it.
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
                        setIsShared(false);
                        setFundedFrom("income");
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
                            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
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
                            className="pl-7"
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
                    <Label htmlFor="subcategoryId">Subcategory</Label>
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
                    {/* The hint lives BELOW the select, not in the label: a long
                        category name used to wrap the label onto a second line
                        and push this select out of line with Category and Card
                        (R1). Down here it can wrap freely and nothing moves. */}
                    {selectedCategory ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                            from {selectedCategory.name}
                        </p>
                    ) : null}
                </div>

                <div>
                    <Label htmlFor="cardId">Card</Label>
                    <Select
                        value={cardId}
                        onValueChange={(value) => setCardId(value ?? "")}
                        disabled={isSavings}
                    >
                        <SelectTrigger
                            id="cardId"
                            aria-label="Card"
                            className="mt-1.5 w-full"
                        >
                            {isSavings ? (
                                <span className="text-muted-foreground">
                                    Savings — no card
                                </span>
                            ) : selectedCard ? (
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
                    {isSavings ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                            not needed for savings
                        </p>
                    ) : null}
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
                    className="mt-1.5 flex w-full rounded-lg border border-input bg-background px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
                />
            </div>

            {/* Funding source (spec 0007 §3.1) as two checkboxes, not a
                dropdown: "this month's income" is what almost every expense is,
                so the ordinary case needs no control. Both unchecked = income.
                The two are mutually exclusive — money already had, or money
                given back, never both. */}
            {/* Each box is NAMED by its visible text (`aria-labelledby`) and
                DESCRIBED by the hint (`aria-describedby`), which sits outside
                the label. An `aria-label` here would override the visible text
                with a copy of itself and leave the hint unannounced. The
                description is pointed at only while the hint is rendered — an
                id that resolves to nothing is a broken reference, not an empty
                one. */}
            <div className="flex flex-col gap-2.5">
                <div>
                    <label className="flex items-start gap-2.5">
                        <Checkbox
                            checked={toggles.paidFromSavings}
                            onCheckedChange={(checked) =>
                                setFunding(checked === true, false)
                            }
                            aria-labelledby={SAVINGS_LABEL_ID}
                            aria-describedby={
                                toggles.paidFromSavings
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
                    {toggles.paidFromSavings ? (
                        <p
                            id={SAVINGS_HINT_ID}
                            className="pl-[1.625rem] text-sm text-muted-foreground"
                        >
                            {FUNDING_TOGGLE_HINT}
                        </p>
                    ) : null}
                </div>

                {/* Health-only (§3.3). Also shown when the row already carries
                    the value on another category, so an existing `reimbursed`
                    expense never loses it silently — the user can see it and
                    untick it deliberately. */}
                {canReimburse || fundedFrom === "reimbursed" ? (
                    <div>
                        <label className="flex items-start gap-2.5">
                            <Checkbox
                                checked={toggles.fullyReimbursed}
                                onCheckedChange={(checked) =>
                                    setFunding(false, checked === true)
                                }
                                aria-labelledby={REIMBURSED_LABEL_ID}
                                aria-describedby={
                                    toggles.fullyReimbursed
                                        ? REIMBURSED_HINT_ID
                                        : undefined
                                }
                                className="mt-0.5"
                            />
                            <span
                                id={REIMBURSED_LABEL_ID}
                                className="text-sm font-medium"
                            >
                                {FUNDING_TOGGLE_LABEL.reimbursed}
                            </span>
                        </label>
                        {toggles.fullyReimbursed ? (
                            <p
                                id={REIMBURSED_HINT_ID}
                                className="pl-[1.625rem] text-sm text-muted-foreground"
                            >
                                {FUNDING_TOGGLE_HINT}
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {reimbursedClearedBy ? (
                    <p className="text-xs text-muted-foreground">
                        {`"${FUNDING_TOGGLE_LABEL.reimbursed}" isn't available for ${reimbursedClearedBy}, so it's unchecked.`}
                    </p>
                ) : null}
                {fieldError("fundedFrom")}
            </div>

            {/* Solo mode (Settings.sharesExpenses = false) has no split — the
                control is hidden and the expense saves at 100% mine. */}
            {sharesExpenses ? (
                <div>
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
                        : isEdit
                          ? "Save changes"
                          : "Add expense"}
                </Button>
            </div>
        </form>
    );
}

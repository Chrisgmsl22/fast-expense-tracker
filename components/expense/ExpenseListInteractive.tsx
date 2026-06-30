"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ExpenseForm,
    type CategoryOption,
    type SubcategoryOption,
    type CardOption,
} from "./ExpenseForm";
import { getExpenseForEdit } from "@/app/_actions/expense/get-for-edit";
import { deleteExpense } from "@/app/_actions/expense/delete";
import type {
    ExpenseListItem,
    ExpenseEditable,
} from "@/lib/repositories/expense.repository";

type Props = {
    expenses: ExpenseListItem[];
    categories: CategoryOption[];
    subcategories: SubcategoryOption[];
    cards: CardOption[];
    defaultSharePercentage: number;
    /** Formatted month for the mobile total bar (e.g. "June 2026"). */
    monthLabel: string;
};

/** Cash is the fallback for a null card (legacy rows); the seeded Cash card is green. */
const CASH_COLOR = "#16a34a";

function Dot({ color }: { color: string }) {
    return (
        <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
        />
    );
}

/** Category pill: tinted background + the category color as text. */
function CategoryPill({ name, color }: { name: string; color: string }) {
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${color}1a`, color }}
        >
            <Dot color={color} />
            {name}
        </span>
    );
}

const ROW_GRID = "sm:grid-cols-[5.5rem_minmax(0,1fr)_10rem_9rem_8rem_4rem]";

/**
 * Client list, re-skinned to Confirmed designs V1 (slice 2.2): category filter
 * chips, category pills + card dots, charged / my-share amounts, and a
 * Charged/My-share footer (desktop) / pinned total bar (mobile). A single
 * responsive row tree keeps one set of edit/delete controls. Edit fetches the
 * row's full editable fields on demand; delete confirms in a dialog. Card-payment
 * (`Movement`) rows are deferred to slice 2.6.
 */
export function ExpenseListInteractive({
    expenses,
    categories,
    subcategories,
    cards,
    defaultSharePercentage,
    monthLabel,
}: Props) {
    const router = useRouter();
    const [editing, setEditing] = useState<ExpenseEditable | null>(null);
    const [deleting, setDeleting] = useState<ExpenseListItem | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
        null,
    );
    const [pending, startTransition] = useTransition();

    // Chips reflect only the categories present this month, in name order.
    const presentCategories = useMemo(() => {
        const byId = new Map<
            string,
            { id: string; name: string; color: string }
        >();
        for (const e of expenses) byId.set(e.category.id, e.category);
        return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [expenses]);

    // After a delete + refresh, the active category may no longer be present
    // (its last row is gone). Fall back to "All" so we never show an empty list
    // under a chip that no longer exists, with no chip visibly active.
    const effectiveActiveId =
        activeCategoryId &&
        presentCategories.some((c) => c.id === activeCategoryId)
            ? activeCategoryId
            : null;

    const filtered = useMemo(
        () =>
            effectiveActiveId
                ? expenses.filter((e) => e.category.id === effectiveActiveId)
                : expenses,
        [expenses, effectiveActiveId],
    );

    const charged = filtered.reduce((sum, e) => sum + e.amount, 0);
    const myShare = filtered.reduce((sum, e) => sum + e.actualExpenditure, 0);

    function openEdit(id: string) {
        setActionError(null);
        startTransition(async () => {
            const data = await getExpenseForEdit(id);
            if (!data) {
                setActionError("Couldn't load that expense. Please refresh.");
                return;
            }
            setEditing(data);
        });
    }

    function confirmDelete() {
        if (!deleting) return;
        startTransition(async () => {
            const res = await deleteExpense({ id: deleting.id });
            if (res.ok) {
                setDeleting(null);
                router.refresh();
            } else {
                setActionError(res.message);
            }
        });
    }

    if (expenses.length === 0) {
        return (
            <p className="py-12 text-center text-sm text-muted-foreground">
                No expenses for this month yet.
            </p>
        );
    }

    return (
        <>
            {actionError && !deleting && (
                <p className="mb-2 text-sm text-destructive" role="alert">
                    {actionError}
                </p>
            )}

            {/* Category filter chips */}
            <div
                className="mb-4 flex flex-wrap gap-2"
                role="group"
                aria-label="Filter by category"
            >
                <button
                    type="button"
                    onClick={() => setActiveCategoryId(null)}
                    aria-pressed={effectiveActiveId === null}
                    className={
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                        (effectiveActiveId === null
                            ? "bg-foreground text-background"
                            : "bg-muted text-muted-foreground hover:bg-muted/70")
                    }
                >
                    All
                </button>
                {presentCategories.map((c) => {
                    const active = effectiveActiveId === c.id;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setActiveCategoryId(c.id)}
                            aria-pressed={active}
                            className={
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                                (active
                                    ? "border-transparent"
                                    : "border-border bg-background hover:bg-muted")
                            }
                            style={
                                active
                                    ? {
                                          backgroundColor: `${c.color}1a`,
                                          color: c.color,
                                      }
                                    : undefined
                            }
                        >
                            <Dot color={c.color} />
                            {c.name}
                        </button>
                    );
                })}
            </div>

            {/* Column headers (desktop only) */}
            <div
                className={`hidden border-b pb-2 text-xs font-medium text-muted-foreground sm:grid ${ROW_GRID} sm:items-center sm:gap-4`}
            >
                <span>Date</span>
                <span>Description</span>
                <span>Category</span>
                <span>Card</span>
                <span className="text-right">Amount</span>
                <span className="sr-only">Actions</span>
            </div>

            {/* Rows — one responsive tree (mobile: card with left color border) */}
            <ul className="divide-y">
                {filtered.map((expense) => {
                    const cardColor = expense.card?.color ?? CASH_COLOR;
                    const cardName = expense.card?.name ?? "Cash";
                    return (
                        <li
                            key={expense.id}
                            className={`group relative grid grid-cols-[minmax(0,1fr)_auto_4rem] items-center gap-x-3 gap-y-0.5 py-3 pl-4 sm:gap-4 sm:py-2.5 sm:pl-0 ${ROW_GRID}`}
                        >
                            {/* Mobile category accent — a short centered bar, not a full-height border */}
                            <span
                                aria-hidden
                                className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-full sm:hidden"
                                style={{
                                    backgroundColor: expense.category.color,
                                }}
                            />

                            {/* Date — desktop only */}
                            <span className="hidden whitespace-nowrap text-sm text-muted-foreground sm:block">
                                {formatExpenseDate(expense.date)}
                            </span>

                            {/* Description (+ mobile date · card subline) */}
                            <span className="min-w-0">
                                <span className="block truncate font-medium sm:font-normal">
                                    {expense.description}
                                </span>
                                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
                                    {formatExpenseDate(expense.date)} ·
                                    <Dot color={cardColor} />
                                    {cardName}
                                </span>
                            </span>

                            {/* Category pill — desktop only (mobile uses the left border) */}
                            <span className="hidden sm:block">
                                <CategoryPill
                                    name={expense.category.name}
                                    color={expense.category.color}
                                />
                            </span>

                            {/* Card — desktop only */}
                            <span className="hidden items-center gap-2 text-sm sm:flex">
                                <Dot color={cardColor} />
                                {cardName}
                            </span>

                            {/* Amount + my-share */}
                            <span className="text-right whitespace-nowrap">
                                <span className="block font-semibold">
                                    {formatMxn(expense.amount)}
                                </span>
                                {expense.isShared ? (
                                    <span className="block text-xs text-positive">
                                        {`my share ${formatMxn(expense.actualExpenditure)}`}
                                    </span>
                                ) : (
                                    <span className="block text-xs text-muted-foreground">
                                        not shared
                                    </span>
                                )}
                            </span>

                            {/* Actions — revealed on hover/focus (desktop), always shown on mobile */}
                            <span className="flex justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Edit ${expense.description}`}
                                    onClick={() => openEdit(expense.id)}
                                    disabled={pending}
                                >
                                    <Pencil />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Delete ${expense.description}`}
                                    onClick={() => setDeleting(expense)}
                                    disabled={pending}
                                >
                                    <Trash2 />
                                </Button>
                            </span>
                        </li>
                    );
                })}
            </ul>

            {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                    No expenses in this category this month.
                </p>
            )}

            {/* Totals — desktop footer */}
            <div
                data-testid="totals-desktop"
                className="mt-4 hidden items-center justify-end gap-8 border-t pt-3 text-sm sm:flex"
            >
                <span className="text-muted-foreground">
                    Charged{" "}
                    <span className="font-semibold text-foreground">
                        {formatMxn(charged)}
                    </span>
                </span>
                <span className="text-muted-foreground">
                    My share{" "}
                    <span className="font-semibold text-positive">
                        {formatMxn(myShare)}
                    </span>
                </span>
            </div>

            {/* Totals — mobile pinned bar */}
            <div
                data-testid="totals-mobile"
                className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between bg-foreground px-5 py-3 text-background sm:hidden"
            >
                <span className="text-xs text-background/70">
                    Total spent · {monthLabel}
                    <span className="mt-0.5 block text-lg font-semibold text-background">
                        {formatMxn(charged)}
                    </span>
                </span>
                <span className="text-right text-xs text-background/70">
                    My share
                    <span className="mt-0.5 block text-base font-semibold text-positive">
                        {formatMxn(myShare)}
                    </span>
                </span>
            </div>

            <Dialog
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) setEditing(null);
                }}
            >
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit expense</DialogTitle>
                    </DialogHeader>
                    {editing && (
                        <ExpenseForm
                            key={editing.id}
                            categories={categories}
                            subcategories={subcategories}
                            cards={cards}
                            defaultSharePercentage={defaultSharePercentage}
                            expense={editing}
                            onCancel={() => setEditing(null)}
                            onSuccess={() => {
                                setEditing(null);
                                router.refresh();
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleting !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleting(null);
                        setActionError(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete expense?</DialogTitle>
                        <DialogDescription>
                            {deleting
                                ? `"${deleting.description}" will be permanently removed.`
                                : ""}
                        </DialogDescription>
                    </DialogHeader>
                    {actionError && (
                        <p className="text-sm text-destructive" role="alert">
                            {actionError}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDeleting(null)}
                            disabled={pending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={pending}
                        >
                            {pending ? "Deleting…" : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

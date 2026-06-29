"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
};

/**
 * Client list with row-level edit + delete. `ExpenseList` was a server component
 * and can't hold click handlers, so the interactive table lives here. Edit fetches
 * the row's full editable fields on demand (the list query is names-only) and opens
 * a pre-filled modal; delete asks for confirmation. Both use the shadcn Dialog
 * primitive and refresh the server-rendered data on success.
 */
export function ExpenseListInteractive({
    expenses,
    categories,
    subcategories,
    cards,
    defaultSharePercentage,
}: Props) {
    const router = useRouter();
    const [editing, setEditing] = useState<ExpenseEditable | null>(null);
    const [deleting, setDeleting] = useState<ExpenseListItem | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

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
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Date</th>
                        <th className="py-2 pr-4 font-medium">Description</th>
                        <th className="py-2 pr-4 font-medium">Category</th>
                        <th className="py-2 pr-4 font-medium">Card</th>
                        <th className="py-2 pl-4 text-right font-medium">
                            Amount
                        </th>
                        <th className="py-2 pl-4 text-right font-medium">
                            <span className="sr-only">Actions</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {expenses.map((expense) => (
                        <tr key={expense.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 whitespace-nowrap">
                                {formatExpenseDate(expense.date)}
                            </td>
                            <td className="py-2 pr-4">{expense.description}</td>
                            <td className="py-2 pr-4">
                                {expense.category.name}
                                {expense.subcategory
                                    ? ` · ${expense.subcategory.name}`
                                    : ""}
                            </td>
                            <td className="py-2 pr-4">
                                {expense.card?.name ?? "Cash"}
                            </td>
                            <td className="py-2 pl-4 text-right whitespace-nowrap">
                                {formatMxn(expense.amount)}
                                {expense.isShared ? (
                                    <span className="block text-xs text-muted-foreground">
                                        your share{" "}
                                        {formatMxn(expense.actualExpenditure)}
                                    </span>
                                ) : null}
                            </td>
                            <td className="py-2 pl-4 text-right whitespace-nowrap">
                                <button
                                    type="button"
                                    aria-label={`Edit ${expense.description}`}
                                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                                    onClick={() => openEdit(expense.id)}
                                    disabled={pending}
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Delete ${expense.description}`}
                                    className="ml-3 text-sm font-medium text-destructive underline-offset-2 hover:underline"
                                    onClick={() => setDeleting(expense)}
                                    disabled={pending}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

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

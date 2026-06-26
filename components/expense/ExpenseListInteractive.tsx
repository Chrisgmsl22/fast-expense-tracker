"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
} from "@/lib/services/expense/expense.service";

type Props = {
    expenses: ExpenseListItem[];
    categories: CategoryOption[];
    subcategories: SubcategoryOption[];
    cards: CardOption[];
};

/**
 * Client list with row-level edit + delete. `ExpenseList` was a
 * server component and can't hold click handlers, so the interactive table lives
 * here. Edit fetches the row's full editable fields on demand (the list query is
 * names-only) and opens a pre-filled modal; delete asks for confirmation in a
 * native <dialog> (same pattern as AddExpenseButton). Both refresh the
 * server-rendered data on success.
 */
export function ExpenseListInteractive({
    expenses,
    categories,
    subcategories,
    cards,
}: Props) {
    const router = useRouter();
    const editDialogRef = useRef<HTMLDialogElement>(null);
    const deleteDialogRef = useRef<HTMLDialogElement>(null);
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
            editDialogRef.current?.showModal();
        });
    }

    function openDelete(expense: ExpenseListItem) {
        setActionError(null);
        setDeleting(expense);
        deleteDialogRef.current?.showModal();
    }

    function confirmDelete() {
        if (!deleting) return;
        startTransition(async () => {
            const res = await deleteExpense({ id: deleting.id });
            if (res.ok) {
                deleteDialogRef.current?.close();
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
            {actionError && (
                <p className="mb-2 text-sm text-red-600" role="alert">
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
                                    className="ml-3 text-sm font-medium text-red-600 underline-offset-2 hover:underline"
                                    onClick={() => openDelete(expense)}
                                    disabled={pending}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <dialog
                ref={editDialogRef}
                className="w-full max-w-md rounded-lg p-6 backdrop:bg-black/40"
                aria-label="Edit expense"
                onClose={() => setEditing(null)}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Edit expense</h2>
                    <button
                        type="button"
                        aria-label="Close"
                        className="text-xl leading-none"
                        onClick={() => editDialogRef.current?.close()}
                    >
                        ✕
                    </button>
                </div>
                {editing && (
                    <ExpenseForm
                        key={editing.id}
                        categories={categories}
                        subcategories={subcategories}
                        cards={cards}
                        expense={editing}
                        onSuccess={() => {
                            editDialogRef.current?.close();
                            setEditing(null);
                            router.refresh();
                        }}
                    />
                )}
            </dialog>

            <dialog
                ref={deleteDialogRef}
                className="w-full max-w-sm rounded-lg p-6 backdrop:bg-black/40"
                aria-label="Confirm delete"
                onClose={() => setDeleting(null)}
            >
                <h2 className="text-lg font-semibold">Delete expense?</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    {deleting
                        ? `"${deleting.description}" will be permanently removed.`
                        : ""}
                </p>
                {actionError && (
                    <p className="mt-3 text-sm text-red-600" role="alert">
                        {actionError}
                    </p>
                )}
                <div className="mt-6 flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => deleteDialogRef.current?.close()}
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
                </div>
            </dialog>
        </>
    );
}

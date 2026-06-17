"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
    ExpenseForm,
    type CategoryOption,
    type SubcategoryOption,
    type CardOption,
} from "./ExpenseForm";

type Props = {
    categories: CategoryOption[];
    subcategories: SubcategoryOption[];
    cards: CardOption[];
};

/**
 * "+ Add" button on the expenses page (slice 1.4). Opens the capture form in a
 * native <dialog> modal; closes on a successful create.
 */
export function AddExpenseButton(props: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    return (
        <>
            <Button onClick={() => dialogRef.current?.showModal()}>
                + Add
            </Button>
            <dialog
                ref={dialogRef}
                className="w-full max-w-md rounded-lg p-6 backdrop:bg-black/40"
                aria-label="Add expense"
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Add expense</h2>
                    <button
                        type="button"
                        aria-label="Close"
                        className="text-xl leading-none"
                        onClick={() => dialogRef.current?.close()}
                    >
                        ✕
                    </button>
                </div>
                <ExpenseForm
                    {...props}
                    onSuccess={() => dialogRef.current?.close()}
                />
            </dialog>
        </>
    );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
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
    defaultSharePercentage: number;
};

export function AddExpenseButton(props: Props) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button>+ Add</Button>} />
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Add expense</DialogTitle>
                </DialogHeader>
                <ExpenseForm
                    {...props}
                    onCancel={() => setOpen(false)}
                    onSuccess={() => {
                        setOpen(false);
                        // Re-fetch the server-rendered list so the new expense shows.
                        router.refresh();
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}

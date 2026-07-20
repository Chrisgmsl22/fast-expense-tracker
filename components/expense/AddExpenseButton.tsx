"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    ChevronLeft,
    CreditCard,
    HandCoins,
    Receipt,
    Send,
} from "lucide-react";
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
import { CardPaymentForm } from "@/components/movement/CardPaymentForm";
import { TransferForm } from "@/components/movement/TransferForm";

type Props = {
    categories: CategoryOption[];
    subcategories: SubcategoryOption[];
    cards: CardOption[];
    defaultSharePercentage: number;
    partnerName: string;
    /**
     * Shared-expense mode (Settings.sharesExpenses). In Solo mode the partner
     * transfer items ("I paid {partner}" / "{partner} paid me") are hidden — the
     * menu is just Expense + Card payment.
     */
    sharesExpenses: boolean;
};

/** Which thing the user is logging; `menu` is the type picker (ADR-0018). */
type Mode = "menu" | "expense" | "card_payment" | "transfer" | "receive";

const titlesFor = (partnerName: string): Record<Mode, string> => ({
    menu: "Add",
    expense: "Add expense",
    card_payment: "Add card payment",
    transfer: `I paid ${partnerName}`,
    receive: `${partnerName} paid me`,
});

/**
 * The `+ Add` entry point. Opens a type picker (expense / card payment / transfer
 * to the partner) that routes to the matching form. Money movements are logged
 * here alongside expenses so there's one place to record everything (ADR-0018).
 */
export function AddExpenseButton({
    categories,
    subcategories,
    cards,
    defaultSharePercentage,
    partnerName,
    sharesExpenses,
}: Props) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<Mode>("menu");
    const router = useRouter();
    const titles = titlesFor(partnerName);

    // Reset to the picker on close so the next open starts on the menu — not the
    // form that was last shown (close() sets open=false directly, bypassing
    // onOpenChange, so it must reset mode itself).
    function close() {
        setOpen(false);
        setMode("menu");
    }

    function onOpenChange(next: boolean) {
        setOpen(next);
        if (!next) setMode("menu");
    }

    function onSuccess() {
        close();
        // Re-fetch the server-rendered feed so the new row shows.
        router.refresh();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger render={<Button>+ Add</Button>} />
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {mode !== "menu" ? (
                            <button
                                type="button"
                                onClick={() => setMode("menu")}
                                aria-label="Back to add menu"
                                className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                <ChevronLeft className="size-4" />
                            </button>
                        ) : null}
                        {titles[mode]}
                    </DialogTitle>
                </DialogHeader>

                {mode === "menu" ? (
                    <div className="flex flex-col gap-2">
                        <TypeButton
                            icon={<Receipt className="size-5" />}
                            title="Expense"
                            subtitle="A purchase you made"
                            onClick={() => setMode("expense")}
                        />
                        <TypeButton
                            icon={<CreditCard className="size-5" />}
                            title="Card payment"
                            subtitle="Money you paid toward a card"
                            onClick={() => setMode("card_payment")}
                        />
                        {sharesExpenses ? (
                            <>
                                <TypeButton
                                    icon={<Send className="size-5" />}
                                    title={`I paid ${partnerName}`}
                                    subtitle={`Money you sent ${partnerName}`}
                                    onClick={() => setMode("transfer")}
                                />
                                <TypeButton
                                    icon={<HandCoins className="size-5" />}
                                    title={`${partnerName} paid me`}
                                    subtitle={`Money ${partnerName} sent you`}
                                    onClick={() => setMode("receive")}
                                />
                            </>
                        ) : null}
                    </div>
                ) : null}

                {mode === "expense" ? (
                    <ExpenseForm
                        categories={categories}
                        subcategories={subcategories}
                        cards={cards}
                        defaultSharePercentage={defaultSharePercentage}
                        sharesExpenses={sharesExpenses}
                        onCancel={close}
                        onSuccess={onSuccess}
                    />
                ) : null}

                {mode === "card_payment" ? (
                    <CardPaymentForm
                        cards={cards}
                        onCancel={close}
                        onSuccess={onSuccess}
                    />
                ) : null}

                {mode === "transfer" ? (
                    <TransferForm
                        partnerName={partnerName}
                        onCancel={close}
                        onSuccess={onSuccess}
                    />
                ) : null}

                {mode === "receive" ? (
                    <TransferForm
                        direction="gf_received"
                        partnerName={partnerName}
                        onCancel={close}
                        onSuccess={onSuccess}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function TypeButton({
    icon,
    title,
    subtitle,
    onClick,
}: {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted"
        >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                {icon}
            </span>
            <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">
                    {subtitle}
                </span>
            </span>
        </button>
    );
}

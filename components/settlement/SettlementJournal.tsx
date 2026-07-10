"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeftRight,
    BarChart3,
    Check,
    CreditCard,
    Pencil,
    Trash2,
} from "lucide-react";

import { getExpenseForEdit } from "@/app/_actions/expense/get-for-edit";
import { deleteExpense } from "@/app/_actions/expense/delete";
import type { CategoryOption } from "@/components/expense/ExpenseForm";
import {
    PartnerDebtForm,
    type PartnerDebtEditable,
} from "@/components/movement/PartnerDebtForm";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toDateInputValue } from "@/lib/dates";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import { PARTNER_NAME } from "@/lib/partner";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";

/** The auto-generated description when a debt is logged without a note. */
const DEFAULT_DEBT_DESCRIPTION = `I owe ${PARTNER_NAME}`;

type PartnerDebtRow = Extract<SettlementJournalItem, { kind: "partner_debt" }>;

/**
 * The settlement movement journal (spec 0004 §3.1) — shared expenses you paid
 * (+ her 32%), "I owe {partner}" debts (− your share), and transfers, newest
 * first. Previous-month rows sit under an "Earlier months" divider. Only the
 * "I owe" debts are editable/deletable here — they're the entries that belong
 * to the settlement; edits re-assert the debt invariants and the page
 * re-renders so the balance recomputes.
 */
export function SettlementJournal({
    journal,
    categories,
}: {
    journal: SettlementJournalItem[];
    categories: CategoryOption[];
}) {
    const router = useRouter();
    const [editing, setEditing] = useState<PartnerDebtEditable | null>(null);
    const [deleting, setDeleting] = useState<PartnerDebtRow | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function openEdit(item: PartnerDebtRow) {
        setActionError(null);
        startTransition(async () => {
            const data = await getExpenseForEdit(item.id);
            if (!data) {
                setActionError("Couldn't load that debt. Please refresh.");
                return;
            }
            setEditing({
                id: data.id,
                date: toDateInputValue(data.date),
                amount: String(data.amount),
                categoryId: data.categoryId,
                // The note is stored as the description; a blank note falls back
                // to the default label, so surface an empty field for that case.
                note:
                    data.description === DEFAULT_DEBT_DESCRIPTION
                        ? ""
                        : data.description,
            });
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

    if (journal.length === 0) {
        return (
            <div className="rounded-xl border p-5">
                <p className="font-semibold">Movement journal</p>
                <p className="mt-3 text-sm text-muted-foreground">
                    Nothing to settle yet.
                </p>
            </div>
        );
    }

    // The service sorts newest-first, so all current-month rows precede the
    // carried-over ones; the divider goes before the first carried row.
    const firstCarriedId = journal.find((j) => j.carriedOver)?.id;

    return (
        <div className="rounded-xl border p-5">
            <div className="flex items-baseline justify-between">
                <p className="font-semibold">Movement journal</p>
                <p className="text-xs text-muted-foreground">
                    shared expenses · debts · transfers
                </p>
            </div>

            {actionError && !deleting && (
                <p className="mt-3 text-sm text-destructive" role="alert">
                    {actionError}
                </p>
            )}

            <ul className="mt-3 divide-y">
                {journal.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                        {item.id === firstCarriedId && (
                            <p className="py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                Earlier months
                            </p>
                        )}
                        <JournalRow
                            item={item}
                            actions={
                                item.kind === "partner_debt" ? (
                                    <RowActions
                                        description={item.description}
                                        pending={pending}
                                        onEdit={() => openEdit(item)}
                                        onDelete={() => {
                                            setActionError(null);
                                            setDeleting(item);
                                        }}
                                    />
                                ) : null
                            }
                        />
                    </li>
                ))}
            </ul>

            <Dialog
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) setEditing(null);
                }}
            >
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{`Edit "I owe ${PARTNER_NAME}"`}</DialogTitle>
                    </DialogHeader>
                    {editing && (
                        <PartnerDebtForm
                            key={editing.id}
                            categories={categories}
                            debt={editing}
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
                        <DialogTitle>Delete this debt?</DialogTitle>
                        <DialogDescription>
                            {deleting
                                ? `"${deleting.description}" (${formatMxn(deleting.amount)}) will be permanently removed.`
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
                            onClick={() => {
                                setActionError(null);
                                setDeleting(null);
                            }}
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
        </div>
    );
}

/** Edit + delete controls for a debt row (revealed on hover/focus, desktop). */
function RowActions({
    description,
    pending,
    onEdit,
    onDelete,
}: {
    description: string;
    pending: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <span className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${description}`}
                onClick={onEdit}
                disabled={pending}
            >
                <Pencil />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${description}`}
                onClick={onDelete}
                disabled={pending}
            >
                <Trash2 />
            </Button>
        </span>
    );
}

function JournalRow({
    item,
    actions,
}: {
    item: SettlementJournalItem;
    actions: ReactNode;
}) {
    if (item.kind === "your_expense") {
        return (
            <Row
                icon={<Check className="size-4" />}
                iconClass="bg-positive-tint text-positive"
                title={item.description}
                subtitle={`${formatExpenseDate(item.date)} · you paid ${formatMxn(item.gross)} · ${PARTNER_NAME}'s 32%`}
                amount={`+${formatMxn(item.partnerShare)}`}
                amountClass="text-positive"
                actions={actions}
            />
        );
    }
    if (item.kind === "partner_debt") {
        return (
            <Row
                icon={<BarChart3 className="size-4" />}
                iconClass="bg-transfer-tint text-transfer"
                title={item.description}
                subtitle={`${formatExpenseDate(item.date)} · un-itemized`}
                amount={`−${formatMxn(item.amount)}`}
                amountClass="text-transfer"
                actions={actions}
            />
        );
    }
    if (item.kind === "funded_card_payment") {
        return (
            <Row
                icon={<CreditCard className="size-4" />}
                iconClass="bg-payment-tint text-payment"
                title={`${PARTNER_NAME}'s money → card payment`}
                subtitle={`${formatExpenseDate(item.date)} · settles what she owes`}
                amount={formatMxn(item.amount)}
                amountClass="text-payment"
                actions={actions}
            />
        );
    }
    const inbound = item.direction === "gf_received";
    return (
        <Row
            icon={<ArrowLeftRight className="size-4" />}
            iconClass={
                inbound
                    ? "bg-positive-tint text-positive"
                    : "bg-transfer-tint text-transfer"
            }
            title={
                inbound
                    ? `Transfer — ${PARTNER_NAME} paid you`
                    : `Transfer — you paid ${PARTNER_NAME}`
            }
            subtitle={formatExpenseDate(item.date)}
            amount={formatMxn(item.amount)}
            amountClass={inbound ? "text-positive" : "text-transfer"}
            actions={actions}
        />
    );
}

function Row({
    icon,
    iconClass,
    title,
    subtitle,
    amount,
    amountClass,
    actions,
}: {
    icon: React.ReactNode;
    iconClass: string;
    title: string;
    subtitle: string;
    amount: string;
    amountClass: string;
    actions: ReactNode;
}) {
    return (
        <div className="group flex items-center gap-3 py-2.5">
            <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-md ${iconClass}`}
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                    {title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                    {subtitle}
                </span>
            </span>
            <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${amountClass}`}
            >
                {amount}
            </span>
            {actions}
        </div>
    );
}

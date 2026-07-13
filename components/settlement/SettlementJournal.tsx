"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, BarChart3, Check, Pencil, Trash2 } from "lucide-react";

import { deleteMovement } from "@/app/_actions/movement/delete";
import {
    PartnerDebtForm,
    type PartnerDebtEditable,
} from "@/components/movement/PartnerDebtForm";
import {
    TransferForm,
    type TransferEditable,
} from "@/components/movement/TransferForm";
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
type TransferRow = Extract<SettlementJournalItem, { kind: "transfer" }>;
/** Either journal row that can be edited + deleted here (CHORE-1, CHORE-5). */
type DeletableRow = PartnerDebtRow | TransferRow;

/** The row's human title — reused by the row, its action labels, and the delete copy. */
function transferTitle(direction: TransferRow["direction"]): string {
    return direction === "gf_received"
        ? `Transfer — ${PARTNER_NAME} paid you`
        : `Transfer — you paid ${PARTNER_NAME}`;
}

function rowTitle(row: DeletableRow): string {
    return row.kind === "partner_debt"
        ? row.description
        : transferTitle(row.direction);
}

/**
 * The settlement movement journal (spec 0004 §3.1) — shared expenses you paid
 * (+ her 32%), "I owe {partner}" debts (− your share), and transfers, newest
 * first. Previous-month rows sit under an "Earlier months" divider. The "I owe"
 * debts and the transfers are editable/deletable here — they're the entries you
 * own on the settlement side (CHORE-1, CHORE-5); a shared expense is edited on
 * the expenses screen. Edits re-render the page so the balance recomputes.
 */
export function SettlementJournal({
    journal,
}: {
    journal: SettlementJournalItem[];
}) {
    const router = useRouter();
    const [editing, setEditing] = useState<PartnerDebtEditable | null>(null);
    const [editingTransfer, setEditingTransfer] = useState<TransferRow | null>(
        null,
    );
    const [deleting, setDeleting] = useState<DeletableRow | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function openEdit(item: PartnerDebtRow) {
        setActionError(null);
        // The debt movement carries everything the form needs, so prefill straight
        // from the journal row — no server round-trip. A blank note falls back to
        // the default label, so surface an empty field for that case.
        setEditing({
            id: item.id,
            date: toDateInputValue(item.date),
            amount: String(item.amount),
            note:
                item.description === DEFAULT_DEBT_DESCRIPTION
                    ? ""
                    : item.description,
        });
    }

    function openEditTransfer(item: TransferRow) {
        setActionError(null);
        // Transfer rows carry date/amount/note, so prefill from the row too; the
        // form takes the direction as a prop (see the edit dialog below).
        setEditingTransfer(item);
    }

    /** String-input shape the transfer form prefills from the row being edited. */
    const transferEdit: TransferEditable | null = editingTransfer && {
        id: editingTransfer.id,
        date: toDateInputValue(editingTransfer.date),
        amount: String(editingTransfer.amount),
        note: editingTransfer.note ?? "",
    };

    function confirmDelete() {
        if (!deleting) return;
        startTransition(async () => {
            const res = await deleteMovement({ id: deleting.id });
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

            <ul className="mt-3 max-h-[55vh] divide-y overflow-x-hidden overflow-y-auto">
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
                                        label={item.description}
                                        pending={pending}
                                        onEdit={() => openEdit(item)}
                                        onDelete={() => {
                                            setActionError(null);
                                            setDeleting(item);
                                        }}
                                    />
                                ) : item.kind === "transfer" ? (
                                    <RowActions
                                        label={transferTitle(item.direction)}
                                        pending={pending}
                                        onEdit={() => openEditTransfer(item)}
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
                open={editingTransfer !== null}
                onOpenChange={(open) => {
                    if (!open) setEditingTransfer(null);
                }}
            >
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit transfer</DialogTitle>
                    </DialogHeader>
                    {editingTransfer && transferEdit && (
                        <TransferForm
                            key={editingTransfer.id}
                            direction={editingTransfer.direction}
                            transfer={transferEdit}
                            onCancel={() => setEditingTransfer(null)}
                            onSuccess={() => {
                                setEditingTransfer(null);
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
                        <DialogTitle>
                            {deleting?.kind === "transfer"
                                ? "Delete this transfer?"
                                : "Delete this debt?"}
                        </DialogTitle>
                        <DialogDescription>
                            {deleting
                                ? `${rowTitle(deleting)} (${formatMxn(deleting.amount)}) will be permanently removed.`
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

/** Edit + delete controls for a debt/transfer row (revealed on hover/focus, desktop). */
function RowActions({
    label,
    pending,
    onEdit,
    onDelete,
}: {
    label: string;
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
                aria-label={`Edit ${label}`}
                onClick={onEdit}
                disabled={pending}
            >
                <Pencil />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${label}`}
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
                iconClass="bg-debt-tint text-debt"
                rowTint="border-debt bg-debt-tint"
                title={item.description}
                subtitle={`${formatExpenseDate(item.date)} · un-itemized`}
                amount={`−${formatMxn(item.amount)}`}
                amountClass="text-debt"
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
            rowTint={
                inbound
                    ? "border-positive bg-positive-tint"
                    : "border-transfer bg-transfer-tint"
            }
            title={
                inbound
                    ? `Transfer — ${PARTNER_NAME} paid you`
                    : `Transfer — you paid ${PARTNER_NAME}`
            }
            subtitle={
                item.note
                    ? `${formatExpenseDate(item.date)} · ${item.note}`
                    : formatExpenseDate(item.date)
            }
            amount={formatMxn(item.amount)}
            amountClass={inbound ? "text-positive" : "text-transfer"}
            actions={actions}
        />
    );
}

function Row({
    icon,
    iconClass,
    rowTint,
    title,
    subtitle,
    amount,
    amountClass,
    actions,
}: {
    icon: React.ReactNode;
    iconClass: string;
    /** Colour-coded left border + tint, bled to the card edges. Omit for a plain row. */
    rowTint?: string;
    title: string;
    subtitle: string;
    amount: string;
    amountClass: string;
    actions: ReactNode;
}) {
    // Every row carries a 3px left stripe (transparent when plain) so icons stay
    // aligned; highlighted money kinds fill it with their colour + tint. The band
    // stays inside the scroll container — no negative-margin bleed, which would
    // widen the row past the list and trigger a horizontal scrollbar.
    const stripe = rowTint ? rowTint : "border-transparent";
    return (
        <div
            className={`group flex items-center gap-3 border-l-[3px] py-2.5 pl-3 ${stripe}`}
        >
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

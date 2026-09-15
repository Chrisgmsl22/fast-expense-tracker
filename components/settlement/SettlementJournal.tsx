"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, BarChart3, Check, Pencil, Trash2 } from "lucide-react";

import { deleteExpense } from "@/app/_actions/expense/delete";
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
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";

/** The auto-generated description when a debt is logged without a note. */
const defaultDebtDescription = (partnerName: string): string =>
    `I owe ${partnerName}`;

type PartnerDebtRow = Extract<SettlementJournalItem, { kind: "partner_debt" }>;
type TransferRow = Extract<SettlementJournalItem, { kind: "transfer" }>;
/** Either journal row that can be edited + deleted here (CHORE-1, CHORE-5). */
type DeletableRow = PartnerDebtRow | TransferRow;

/** The row's human title — reused by the row, its action labels, and the delete copy. */
function transferTitle(
    direction: TransferRow["direction"],
    partnerName: string,
): string {
    return direction === "gf_received"
        ? `Transfer — ${partnerName} paid you`
        : `Transfer — you paid ${partnerName}`;
}

/**
 * A debt's second line. When the row's title is the thing she fronted (its
 * note), the generic "I owe {partner}" drops here — exactly what `movementRowText`
 * does in both feeds, so the same debt reads the same everywhere. When there is
 * no note the title already says "I owe {partner}", so the date stands alone.
 *
 * The tail explains a missing control, and `locked` outranks `source` for the
 * same reason it does for the buttons: a locked row has no delete either, so
 * telling its reader to "delete to change" would name a way out that is not
 * there. Locked says locked; only an editable row mentions its source.
 */
function debtSubtitle(row: PartnerDebtRow, partnerName: string): string {
    const label = defaultDebtDescription(partnerName);
    return [
        formatExpenseDate(row.date),
        row.description === label ? null : label,
        row.locked
            ? "closed a settlement · locked"
            : row.source === "movement"
              ? "older entry · delete to change"
              : null,
    ]
        .filter(Boolean)
        .join(" · ");
}

/**
 * A transfer's second line: its date, its note, and — when the transfer closed a
 * settlement — why it now has no edit or delete control. Without that last part
 * the row just looks inert, and the reason for it is invisible.
 */
function transferSubtitle(row: TransferRow): string {
    return [
        formatExpenseDate(row.date),
        row.note,
        row.locked ? "closed a settlement · locked" : null,
    ]
        .filter(Boolean)
        .join(" · ");
}

function rowTitle(row: DeletableRow, partnerName: string): string {
    return row.kind === "partner_debt"
        ? row.description
        : transferTitle(row.direction, partnerName);
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
    partnerName,
    title = "Movement journal",
    emptyMessage = "Nothing to settle yet.",
    bare = false,
    readOnly = false,
}: {
    journal: SettlementJournalItem[];
    partnerName: string;
    /** Heading for this projection of the rows ("Open settlement", a month, …). */
    title?: string;
    /** What an empty set of rows says — a real empty state, never a bare zero. */
    emptyMessage?: string;
    /** Drop the card chrome when the caller already provides it (History). */
    bare?: boolean;
    /**
     * Hide the edit/delete controls. A closed cycle is a filed record: its rows
     * are frozen server-side, so offering the buttons would only lead to a
     * refusal.
     */
    readOnly?: boolean;
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
                item.description === defaultDebtDescription(partnerName)
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
            // A debt is an expense now (spec 0007 §6a) — except for a legacy
            // `gf_fronted` movement the migration could not convert, which still
            // counts in the balance and still renders here. The row carries
            // which table it came from, so neither kind is deleted through the
            // other's table and told "not found" for a row in plain sight.
            const res =
                deleting.kind === "partner_debt" &&
                deleting.source === "expense"
                    ? await deleteExpense({ id: deleting.id })
                    : await deleteMovement({ id: deleting.id });
            if (res.ok) {
                setDeleting(null);
                router.refresh();
            } else {
                setActionError(res.message);
            }
        });
    }

    const shell = bare ? "" : "rounded-xl border p-5";

    if (journal.length === 0) {
        return (
            <div className={shell}>
                {!bare && <p className="font-semibold">{title}</p>}
                <p
                    className={`text-sm text-muted-foreground ${bare ? "" : "mt-3"}`}
                >
                    {emptyMessage}
                </p>
            </div>
        );
    }

    // The service sorts newest-first, so all current-month rows precede the
    // carried-over ones; the divider goes before the first carried row.
    const firstCarriedId = journal.find((j) => j.carriedOver)?.id;

    return (
        <div className={shell}>
            {!bare && (
                <div className="flex items-baseline justify-between">
                    <p className="font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground">
                        shared expenses · debts · transfers
                    </p>
                </div>
            )}

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
                            partnerName={partnerName}
                            actions={
                                // A locked row drops its controls wherever it
                                // renders. The row carries the fact, so a view
                                // cannot reintroduce the buttons by forgetting
                                // `readOnly` — learning a row is frozen only
                                // after confirming a delete is not acceptable.
                                readOnly || item.locked ? null : item.kind ===
                                  "partner_debt" ? (
                                    <RowActions
                                        label={item.description}
                                        pending={pending}
                                        // A legacy movement-backed debt has no
                                        // edit form left — the form it used to
                                        // open now writes expenses. Delete and
                                        // re-log it; the subtitle says so rather
                                        // than offering a button that fails.
                                        onEdit={
                                            item.source === "expense"
                                                ? () => openEdit(item)
                                                : undefined
                                        }
                                        onDelete={() => {
                                            setActionError(null);
                                            setDeleting(item);
                                        }}
                                    />
                                ) : item.kind === "transfer" ? (
                                    <RowActions
                                        label={transferTitle(
                                            item.direction,
                                            partnerName,
                                        )}
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
                        <DialogTitle>{`Edit "I owe ${partnerName}"`}</DialogTitle>
                    </DialogHeader>
                    {editing && (
                        <PartnerDebtForm
                            key={editing.id}
                            debt={editing}
                            partnerName={partnerName}
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
                            partnerName={partnerName}
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
                                ? `${rowTitle(deleting, partnerName)} (${formatMxn(deleting.amount)}) will be permanently removed.`
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
    /** Omitted when the row has no edit form — the button is then not rendered. */
    onEdit?: () => void;
    onDelete: () => void;
}) {
    return (
        <span className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {onEdit && (
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
            )}
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
    partnerName,
    actions,
}: {
    item: SettlementJournalItem;
    partnerName: string;
    actions: ReactNode;
}) {
    if (item.kind === "your_expense") {
        return (
            <Row
                icon={<Check className="size-4" />}
                iconClass="bg-positive-tint text-positive"
                title={item.description}
                // A locked transfer says why it has no controls, so this row
                // says it too: it is the only other one without them, and
                // "inert for no stated reason" is the thing worth avoiding.
                subtitle={`${formatExpenseDate(item.date)} · you paid ${formatMxn(item.gross)} · ${partnerName}'s 32% · edit on the Expenses screen`}
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
                subtitle={debtSubtitle(item, partnerName)}
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
                    ? `Transfer — ${partnerName} paid you`
                    : `Transfer — you paid ${partnerName}`
            }
            subtitle={transferSubtitle(item)}
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

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { SAVINGS_SLUG } from "@/lib/domain/dashboard";
import { isExpenseFrozen, isMovementFrozen } from "@/lib/domain/frozen-row";
import {
    computeFeedTotals,
    nonIncomeFundedRows,
    type MovementType,
} from "@/lib/domain/movement";
import type { CoupleBalance } from "@/lib/domain/settlement";
import { RowFundingBadge } from "./FundingBadge";
import { buildFeed } from "@/lib/feed";
import { expenseCardLabel } from "@/lib/expense-display";
import {
    movementDisplay,
    movementRowText,
} from "@/components/movement/movement-display";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import { SummaryStrip } from "@/components/money/SummaryStrip";
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
import { CardPaymentForm } from "@/components/movement/CardPaymentForm";
import { TransferForm } from "@/components/movement/TransferForm";
import { getExpenseForEdit } from "@/app/_actions/expense/get-for-edit";
import { deleteExpense } from "@/app/_actions/expense/delete";
import { deleteMovement } from "@/app/_actions/movement/delete";
import { getMovementForEdit } from "@/app/_actions/movement/get-for-edit";
import { toDateInputValue } from "@/lib/dates";
import type {
    ExpenseListItem,
    ExpenseEditable,
} from "@/lib/repositories/expense.repository";
import type {
    MovementListItem,
    MovementEditable,
} from "@/lib/repositories/movement.repository";
import { useCategoryName } from "@/i18n/category-name";

type Props = {
    expenses: ExpenseListItem[];
    movements: MovementListItem[];
    categories: CategoryOption[];
    subcategories: SubcategoryOption[];
    cards: CardOption[];
    defaultSharePercentage: number;
    partnerName: string;
    /** Shared-expense mode — threaded to the edit form's split control. */
    sharesExpenses: boolean;
    /** The month on screen, for the breakdown modal's heading. */
    monthLabel: string;
    /** Whether that month is the live one — the reminder names its scope when not. */
    isCurrentMonth: boolean;
    /**
     * The OPEN cycle's balance, shown as a reminder above the chin. It belongs to a
     * cycle, not to the month being viewed (spec 0007 §3.5).
     */
    settlement?: CoupleBalance;
    incomeTotal?: number;
};

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

/** Mobile: the title owns the first line and the badge wraps under it. Desktop: one line. */
const ROW_TITLE =
    "col-span-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap";
const ROW_TITLE_TEXT = "min-w-0 break-words max-sm:basis-full sm:truncate";

function movementEditTitleKey(
    type: MovementType | undefined,
): "editCardPayment" | "editTransfer" {
    return type === "card_payment" ? "editCardPayment" : "editTransfer";
}

/**
 * Client list, re-skinned to Confirmed designs V1 + money movements
 * (ADR-0018). Expenses keep category filter chips, pills, and edit/delete.
 * Movements interleave by date only in the unfiltered ("All") view — they have
 * no category, so a filter hides them. A debt she fronted does NOT appear here:
 * it is settlement-only (spec 0007 §6b). Money you SENT her does, as an expense.
 */
export function ExpenseListInteractive({
    expenses,
    movements,
    categories,
    subcategories,
    cards,
    defaultSharePercentage,
    partnerName,
    sharesExpenses,
    monthLabel,
    isCurrentMonth,
    settlement,
    incomeTotal,
}: Props) {
    const router = useRouter();
    const t = useTranslations("expenses.list");
    const tActions = useTranslations("common.actions");
    const tm = useTranslations("movements");
    const locale = useLocale();
    const categoryName = useCategoryName();
    const [editing, setEditing] = useState<ExpenseEditable | null>(null);
    const [editingMovement, setEditingMovement] =
        useState<MovementEditable | null>(null);
    const [deleting, setDeleting] = useState<ExpenseListItem | null>(null);
    const [deletingMovement, setDeletingMovement] =
        useState<MovementListItem | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
        null,
    );
    const [pending, startTransition] = useTransition();
    const listAlertRef = useRef<HTMLParagraphElement>(null);
    const showListAlert =
        actionError !== null && !deleting && !deletingMovement;

    // The alert sits above the list, so a refusal on a lower row would otherwise
    // land off-screen and the click would look like it did nothing.
    useEffect(() => {
        if (!showListAlert) return;
        listAlertRef.current?.scrollIntoView({ block: "center" });
        listAlertRef.current?.focus({ preventScroll: true });
    }, [showListAlert, actionError]);

    // A frozen refusal means this list predates the close: refresh so the row
    // drops its controls.
    function showRefusal(res: { code: string; message: string }) {
        setActionError(res.message);
        if (res.code === "cycle_closed") router.refresh();
    }

    // Only one confirm dialog is ever mounted, so the two share this state.
    const [deleteFrozen, setDeleteFrozen] = useState(false);
    const deleteAlertRef = useRef<HTMLParagraphElement>(null);

    // Retrying a frozen delete can only repeat the refusal, so the confirm goes
    // dead and focus lands on the reason instead of the page body.
    function showDeleteRefusal(res: { code: string; message: string }) {
        showRefusal(res);
        if (res.code === "cycle_closed") setDeleteFrozen(true);
    }

    useEffect(() => {
        if (deleteFrozen) deleteAlertRef.current?.focus();
    }, [deleteFrozen]);

    function closeDeleteDialogs() {
        setDeleting(null);
        setDeletingMovement(null);
        setActionError(null);
        setDeleteFrozen(false);
    }

    // Each confirm starts clean, so an earlier flow's error never reads as this row's.
    function openDelete(row: ExpenseListItem) {
        closeDeleteDialogs();
        setDeleting(row);
    }

    function openDeleteMovement(row: MovementListItem) {
        closeDeleteDialogs();
        setDeletingMovement(row);
    }

    // Chips reflect only the categories present this month, in the order of the
    // names as shown, so a translated list still reads alphabetically.
    const presentCategories = useMemo(() => {
        const byId = new Map<
            string,
            { id: string; name: string; color: string }
        >();
        for (const e of expenses) {
            byId.set(e.category.id, {
                ...e.category,
                name: categoryName(e.category.name),
            });
        }
        return [...byId.values()].sort((a, b) =>
            a.name.localeCompare(b.name, locale),
        );
    }, [expenses, categoryName, locale]);

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

    // Movements have no category, so they only make sense in the unfiltered view.
    const showMovements = effectiveActiveId === null;
    const feed = useMemo(
        () =>
            showMovements
                ? buildFeed(filtered, movements)
                : filtered.map((e) => ({
                      kind: "expense" as const,
                      date: e.date,
                      expense: e,
                  })),
        [filtered, movements, showMovements],
    );

    // Same helper as the dashboard feed, so both screens print one number.
    // Movements ride along only when on screen: under a category filter the list
    // hides them, so counting them would total rows nobody can see.
    const totals = computeFeedTotals(filtered, showMovements ? movements : []);
    const fundingRows = nonIncomeFundedRows(filtered);

    function openEdit(id: string) {
        setActionError(null);
        startTransition(async () => {
            const res = await getExpenseForEdit(id);
            if (!res.ok) {
                showRefusal(res);
                return;
            }
            setEditing(res.data);
        });
    }

    function confirmDelete() {
        if (!deleting) return;
        startTransition(async () => {
            const res = await deleteExpense({ id: deleting.id });
            if (res.ok) {
                closeDeleteDialogs();
                router.refresh();
            } else {
                showDeleteRefusal(res);
            }
        });
    }

    function openEditMovement(id: string) {
        setActionError(null);
        startTransition(async () => {
            const res = await getMovementForEdit(id);
            if (!res.ok) {
                showRefusal(res);
                return;
            }
            setEditingMovement(res.data);
        });
    }

    function confirmDeleteMovement() {
        if (!deletingMovement) return;
        startTransition(async () => {
            const res = await deleteMovement({ id: deletingMovement.id });
            if (res.ok) {
                closeDeleteDialogs();
                router.refresh();
            } else {
                showDeleteRefusal(res);
            }
        });
    }

    return (
        <>
            {showListAlert && (
                <p
                    ref={listAlertRef}
                    tabIndex={-1}
                    className="mb-2 text-sm text-destructive outline-none"
                    role="alert"
                >
                    {actionError}
                </p>
            )}

            {/* Category filter chips */}
            <div
                className="mb-4 flex flex-wrap gap-2"
                role="group"
                aria-label={t("filterLabel")}
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
                    {t("all")}
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
                <span>{t("columns.date")}</span>
                <span>{t("columns.description")}</span>
                <span>{t("columns.category")}</span>
                <span>{t("columns.card")}</span>
                <span className="text-right">{t("columns.amount")}</span>
                <span className="sr-only">{t("columns.actions")}</span>
            </div>

            {/* Rows — expenses + (in the All view) money movements, by date.
                Desktop: bounded scroller (see frontend.md "Long lists"), so the
                totals bar and chips stay in reach. overflow-x-hidden guards the
                min-content trap (overflow-y:auto forces overflow-x to auto).
                Mobile: the list scrolls with the page, so the top bar can hide
                and return; the totals chin is pinned anyway, and its spacer
                below keeps the last row clear of it. */}
            <ul className="max-h-[70vh] divide-y overflow-x-hidden overflow-y-auto max-sm:max-h-none max-sm:overflow-visible">
                {feed.map((item) =>
                    item.kind === "expense" ? (
                        <ExpenseRow
                            key={`e-${item.expense.id}`}
                            expense={item.expense}
                            partnerName={partnerName}
                            pending={pending}
                            onEdit={() => openEdit(item.expense.id)}
                            onDelete={() => openDelete(item.expense)}
                        />
                    ) : (
                        <MovementRow
                            key={`m-${item.movement.id}`}
                            movement={item.movement}
                            partnerName={partnerName}
                            pending={pending}
                            onEdit={() => openEditMovement(item.movement.id)}
                            onDelete={() => openDeleteMovement(item.movement)}
                        />
                    ),
                )}
            </ul>

            {feed.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                    {expenses.length === 0 && movements.length === 0
                        ? t("empty")
                        : t("emptyCategory")}
                </p>
            )}

            <SummaryStrip
                visibleCount={feed.length}
                categoryLabel={
                    presentCategories.find((c) => c.id === effectiveActiveId)
                        ?.name ?? t("allCategories")
                }
                totals={totals}
                monthLabel={monthLabel}
                partnerName={partnerName}
                settlement={settlement}
                sharesExpenses={sharesExpenses}
                isCurrentMonth={isCurrentMonth}
                incomeTotal={incomeTotal}
                fundingRows={fundingRows}
            />

            <Dialog
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) setEditing(null);
                }}
            >
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t("editExpense")}</DialogTitle>
                    </DialogHeader>
                    {editing && (
                        <ExpenseForm
                            key={editing.id}
                            categories={categories}
                            subcategories={subcategories}
                            cards={cards}
                            defaultSharePercentage={defaultSharePercentage}
                            sharesExpenses={sharesExpenses}
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
                open={editingMovement !== null}
                onOpenChange={(open) => {
                    if (!open) setEditingMovement(null);
                }}
            >
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {t(movementEditTitleKey(editingMovement?.type))}
                        </DialogTitle>
                    </DialogHeader>
                    {/* No debt branch: a `gf_fronted` row never reaches this
                        list (spec 0007 §6b), so it can never be the row being
                        edited. Debts are edited on the settlement page. */}
                    {editingMovement &&
                        (editingMovement.type === "card_payment" ? (
                            <CardPaymentForm
                                key={editingMovement.id}
                                cards={cards}
                                payment={{
                                    id: editingMovement.id,
                                    date: toDateInputValue(
                                        editingMovement.date,
                                    ),
                                    amount: String(editingMovement.amount),
                                    cardId: editingMovement.cardId ?? "",
                                    note: editingMovement.note ?? "",
                                }}
                                onCancel={() => setEditingMovement(null)}
                                onSuccess={() => {
                                    setEditingMovement(null);
                                    router.refresh();
                                }}
                            />
                        ) : (
                            <TransferForm
                                key={editingMovement.id}
                                direction={
                                    editingMovement.type === "gf_received"
                                        ? "gf_received"
                                        : "gf_paid"
                                }
                                transfer={{
                                    id: editingMovement.id,
                                    date: toDateInputValue(
                                        editingMovement.date,
                                    ),
                                    amount: String(editingMovement.amount),
                                    note: editingMovement.note ?? "",
                                    fundedFrom: editingMovement.fundedFrom,
                                }}
                                partnerName={partnerName}
                                onCancel={() => setEditingMovement(null)}
                                onSuccess={() => {
                                    setEditingMovement(null);
                                    router.refresh();
                                }}
                            />
                        ))}
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleting !== null}
                onOpenChange={(open) => {
                    if (!open) closeDeleteDialogs();
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("deleteExpenseTitle")}</DialogTitle>
                        <DialogDescription>
                            {deleting
                                ? t("deleteExpenseBody", {
                                      description: deleting.description,
                                  })
                                : ""}
                        </DialogDescription>
                    </DialogHeader>
                    {actionError && (
                        <p
                            ref={deleteAlertRef}
                            tabIndex={-1}
                            className="text-sm text-destructive outline-none"
                            role="alert"
                        >
                            {actionError}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={closeDeleteDialogs}
                            disabled={pending}
                        >
                            {tActions("cancel")}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={pending || deleteFrozen}
                        >
                            {pending ? t("deleting") : tActions("delete")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deletingMovement !== null}
                onOpenChange={(open) => {
                    if (!open) closeDeleteDialogs();
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("deleteMovementTitle")}</DialogTitle>
                        <DialogDescription>
                            {/* Same phrasing as `SettlementJournal`'s delete, so one
                                action reads alike on both screens. */}
                            {deletingMovement
                                ? t("deleteMovementBody", {
                                      title: movementRowText(
                                          deletingMovement,
                                          partnerName,
                                          tm,
                                      ).title,
                                      amount: formatMxn(
                                          deletingMovement.amount,
                                      ),
                                  })
                                : ""}
                        </DialogDescription>
                    </DialogHeader>
                    {actionError && (
                        <p
                            ref={deleteAlertRef}
                            tabIndex={-1}
                            className="text-sm text-destructive outline-none"
                            role="alert"
                        >
                            {actionError}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={closeDeleteDialogs}
                            disabled={pending}
                        >
                            {tActions("cancel")}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmDeleteMovement}
                            disabled={pending || deleteFrozen}
                        >
                            {pending ? t("deleting") : tActions("delete")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/** One expense row — one responsive tree (mobile card, desktop grid). */
function ExpenseRow({
    expense,
    partnerName,
    pending,
    onEdit,
    onDelete,
}: {
    expense: ExpenseListItem;
    partnerName: string;
    pending: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const t = useTranslations("expenses.list");
    const tCard = useTranslations("common.cardLabel");
    const locale = useLocale();
    const categoryName = useCategoryName();
    // Savings is a transfer — no card (never "Cash").
    const isSavings = expense.category.slug === SAVINGS_SLUG;
    // A payment has no card; the shared helper says so instead of "Cash" (BUG-1).
    const { name: cardName, color: cardColor } = expenseCardLabel(expense, {
        paidPartner: tCard("paidPartner", { partner: partnerName }),
        cash: tCard("cash"),
    });
    // A row a closed cycle counted is frozen server-side, so it shows no controls.
    // The predicate is the settlement's own: a solo expense of the same age stays editable.
    const frozen = isExpenseFrozen(expense);
    // The gold that marked a transfer follows the payment into its expense row (spec 0007 §6a).
    const highlight = isSavings
        ? "border-l-[3px] border-positive bg-positive-tint sm:pl-4"
        : expense.isPartnerPayment
          ? "border-l-[3px] border-transfer bg-transfer-tint sm:pl-4"
          : "";
    const hasRowTint = isSavings || expense.isPartnerPayment;
    return (
        <li
            className={`group relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 py-3 pl-4 sm:gap-4 sm:py-2.5 sm:pl-0 ${ROW_GRID} ${highlight}`}
        >
            {/* Mobile category accent — a short centered bar (a tinted row gets
                a full coloured left border instead, so skip its bar). */}
            {hasRowTint ? null : (
                <span
                    aria-hidden
                    className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-full sm:hidden"
                    style={{ backgroundColor: expense.category.color }}
                />
            )}

            {/* Date — desktop only */}
            <span className="hidden whitespace-nowrap text-sm text-muted-foreground sm:block">
                {formatExpenseDate(expense.date, locale)}
            </span>

            {/* Description (+ mobile date · card subline). On mobile the wrapper
                dissolves so the title spans the whole row and the badge wraps
                under it; amount and actions share the subline's row instead. */}
            <span className="contents sm:block sm:min-w-0">
                <span className={ROW_TITLE}>
                    <span
                        className={`${ROW_TITLE_TEXT} font-medium sm:font-normal`}
                    >
                        {expense.description}
                    </span>
                    <RowFundingBadge row={expense} />
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
                    {isSavings ? (
                        <span className="whitespace-nowrap">
                            {formatExpenseDate(expense.date, locale)}
                        </span>
                    ) : (
                        <>
                            <span className="whitespace-nowrap">
                                {formatExpenseDate(expense.date, locale)} ·
                            </span>
                            <Dot color={cardColor} />
                            <span className="min-w-0 truncate">{cardName}</span>
                        </>
                    )}
                </span>
            </span>

            {/* Category pill — desktop only (mobile uses the left border) */}
            <span className="hidden sm:block">
                <CategoryPill
                    name={categoryName(expense.category.name)}
                    color={expense.category.color}
                />
            </span>

            {/* Card — desktop only */}
            <span className="hidden items-center gap-2 text-sm sm:flex">
                {isSavings ? (
                    <span className="text-muted-foreground">—</span>
                ) : (
                    <>
                        <Dot color={cardColor} />
                        {cardName}
                    </>
                )}
            </span>

            {/* Amount + my-share */}
            <span className="text-right whitespace-nowrap">
                <span
                    className={`block font-semibold ${isSavings ? "text-positive" : ""}`}
                >
                    {formatMxn(expense.amount)}
                </span>
                {isSavings ? (
                    <span className="block text-xs text-positive">
                        {t("setAside")}
                    </span>
                ) : expense.isShared ? (
                    <span className="block text-xs text-positive">
                        {t("myShare", {
                            amount: formatMxn(expense.actualExpenditure),
                        })}
                    </span>
                ) : (
                    <span className="block text-xs text-muted-foreground">
                        {t("notShared")}
                    </span>
                )}
            </span>

            {/* Actions — revealed on hover/focus (desktop), always shown on
                mobile. A frozen row shows why it has none instead. */}
            {frozen ? (
                <LockedRowActions
                    reason={t("locked", { name: expense.description })}
                />
            ) : (
                <span className="flex justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("editRow", { name: expense.description })}
                        onClick={onEdit}
                        disabled={pending}
                    >
                        <Pencil />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("deleteRow", {
                            name: expense.description,
                        })}
                        onClick={onDelete}
                        disabled={pending}
                    >
                        <Trash2 />
                    </Button>
                </span>
            )}
        </li>
    );
}

/**
 * What a frozen row shows where its edit + delete controls would be. The lock takes
 * focus and carries the reason as its accessible name — a `title` appears on hover
 * only, so a keyboard user would never get it.
 */
function LockedRowActions({ reason }: { reason: string }) {
    return (
        <span className="group/lock relative flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <span
                tabIndex={0}
                role="img"
                aria-label={reason}
                title={reason}
                className="rounded-sm p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <Lock aria-hidden className="size-3.5" />
            </span>
            {/* The visible copy of the reason. `aria-hidden` because the lock
                above already carries it as its accessible name. It opens to the
                LEFT, inside the row's own band: on desktop the list is a bounded
                scroller, so anything placed above the first row is clipped. */}
            <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-full z-30 mr-1 hidden w-max max-w-[15rem] -translate-y-1/2 rounded-md bg-foreground px-2 py-1 text-background shadow-md group-hover/lock:block group-focus-within/lock:block"
            >
                {reason}
            </span>
        </span>
    );
}

/** One money-movement row — colour-tagged, editable + deletable (CHORE-5). */
function MovementRow({
    movement: m,
    partnerName,
    pending,
    onEdit,
    onDelete,
}: {
    movement: MovementListItem;
    partnerName: string;
    pending: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const t = useTranslations("expenses.list");
    const tm = useTranslations("movements");
    const locale = useLocale();
    const { amountClass: amountColor, rowTint } = movementDisplay(m.type);
    // `title` names the row's own thing (a debt's note), so two debts don't get
    // one shared accessible name on their edit/delete controls.
    const { title, subline } = movementRowText(m, partnerName, tm);
    // A movement a CLOSED cycle counted is frozen server-side, so it shows no
    // controls. `closedAt` marks one transfer per cycle and cannot be the predicate.
    const frozen = isMovementFrozen(m);

    return (
        <li
            className={`group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 border-l-[3px] py-3 pr-1 pl-4 sm:flex sm:gap-3 sm:py-2.5 ${rowTint}`}
        >
            <span className="contents sm:block sm:min-w-0 sm:flex-1">
                <span className={ROW_TITLE}>
                    <span className={`${ROW_TITLE_TEXT} font-medium`}>
                        {title}
                    </span>
                    <RowFundingBadge row={m} />
                </span>
                <span className="block min-w-0 truncate text-xs text-muted-foreground sm:mt-0.5">
                    {formatExpenseDate(m.date, locale)}
                    {subline ? ` · ${subline}` : ""}
                </span>
            </span>
            <span
                className={`text-right font-semibold whitespace-nowrap ${amountColor}`}
            >
                {formatMxn(m.amount)}
            </span>
            {frozen ? (
                <LockedRowActions
                    reason={
                        m.closedAt
                            ? t("lockedClosedTransfer", { name: title })
                            : t("locked", { name: title })
                    }
                />
            ) : (
                <span className="flex justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("editRow", { name: title })}
                        onClick={onEdit}
                        disabled={pending}
                    >
                        <Pencil />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("deleteRow", { name: title })}
                        onClick={onDelete}
                        disabled={pending}
                    >
                        <Trash2 />
                    </Button>
                </span>
            )}
        </li>
    );
}

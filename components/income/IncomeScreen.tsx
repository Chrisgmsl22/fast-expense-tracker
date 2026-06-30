"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { addVariableIncome } from "@/app/_actions/income/add-variable";
import { deleteVariableIncome } from "@/app/_actions/income/delete-variable";
import { setFixedIncome } from "@/app/_actions/income/set-fixed";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { VariableIncomeItem } from "@/lib/repositories/income.repository";

type Props = {
    /** Recurring monthly amount. */
    fixed: number;
    /** Sum of variable income logged in the displayed month. */
    variableTotal: number;
    /** fixed + variableTotal. */
    total: number;
    /** The viewed month as `YYYY-MM` — new income defaults into it. */
    month: string;
    /** Short month label for the stat cards (e.g. "June"). */
    monthLabel: string;
    variable: VariableIncomeItem[];
};

const MASK = "$ ••••••";

/**
 * Income screen (slice 2.3) — eye/privacy toggle (local state, masks all money),
 * three stat cards (Fixed / Variable · month / Total), an inline-editable fixed
 * amount, and the variable-income log with add + per-row delete. The masked view
 * never leaks a value. Responsive: stat-card row + table on desktop, a single
 * total card + stacked rows on mobile.
 */
export function IncomeScreen({
    fixed,
    variableTotal,
    total,
    month,
    monthLabel,
    variable,
}: Props) {
    const router = useRouter();
    const [hidden, setHidden] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [deleting, setDeleting] = useState<VariableIncomeItem | null>(null);
    const [editingFixed, setEditingFixed] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const money = (n: number) => (hidden ? MASK : formatMxn(n));
    const signed = (n: number) => (hidden ? MASK : `+${formatMxn(n)}`);

    function confirmDelete() {
        if (!deleting) return;
        setActionError(null);
        startTransition(async () => {
            const res = await deleteVariableIncome({ id: deleting.id });
            if (res.ok) {
                setDeleting(null);
                router.refresh();
            } else {
                setActionError(res.message);
            }
        });
    }

    return (
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm sm:p-8">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-semibold">Income</h1>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setHidden((h) => !h)}
                        aria-pressed={hidden}
                    >
                        {hidden ? <EyeOff /> : <Eye />}
                        {hidden ? "Show" : "Hide"}
                    </Button>
                </div>
                <span className="hidden text-sm text-muted-foreground sm:block">
                    drives your bucket targets
                </span>
            </div>

            {actionError && !deleting && (
                <p className="mt-3 text-sm text-destructive" role="alert">
                    {actionError}
                </p>
            )}

            {/* Stat cards — desktop: three across; mobile: a single total card */}
            <div className="mt-6 hidden gap-4 sm:grid sm:grid-cols-3">
                {/* Fixed — inline-editable */}
                <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">
                        Fixed income · monthly
                    </p>
                    {editingFixed ? (
                        <FixedEditor
                            current={fixed}
                            onCancel={() => setEditingFixed(false)}
                            onSaved={() => {
                                setEditingFixed(false);
                                router.refresh();
                            }}
                        />
                    ) : (
                        <>
                            <div className="mt-1 flex items-center gap-2">
                                <p className="text-2xl font-bold">
                                    {money(fixed)}
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Edit fixed income"
                                    onClick={() => {
                                        setActionError(null);
                                        setEditingFixed(true);
                                    }}
                                >
                                    <Pencil />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                recurs every month
                            </p>
                        </>
                    )}
                </div>

                {/* Variable */}
                <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">
                        Variable · {monthLabel}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-positive">
                        {money(variableTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        logged this month
                    </p>
                </div>

                {/* Total */}
                <div className="rounded-lg bg-foreground p-4 text-background">
                    <p className="text-xs text-background/70">
                        Total · {monthLabel}
                    </p>
                    <p className="mt-1 text-2xl font-bold">{money(total)}</p>
                    <p className="text-xs text-background/70">
                        fixed + variable
                    </p>
                </div>
            </div>

            {/* Mobile total card */}
            <div className="mt-6 rounded-lg bg-foreground p-5 text-center text-background sm:hidden">
                <p className="text-xs text-background/70">
                    Total · {monthLabel}
                </p>
                <p className="mt-1 text-3xl font-bold">{money(total)}</p>
                <p className="mt-1 text-xs text-background/70">
                    {hidden
                        ? "fixed · variable"
                        : `${formatMxn(fixed)} fixed · ${formatMxn(variableTotal)} variable`}
                </p>
            </div>

            {/* Variable income log */}
            <div className="mt-8 flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                    <span className="hidden sm:inline">
                        Variable income log
                    </span>
                    <span className="sm:hidden">Variable income</span>
                </h2>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setActionError(null);
                        setAddOpen(true);
                    }}
                >
                    <span className="hidden sm:inline">+ Add income</span>
                    <span className="sm:hidden">+ Add</span>
                </Button>
            </div>

            {variable.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                    No variable income logged for {monthLabel} yet.
                </p>
            ) : (
                <>
                    {/* Desktop column headers */}
                    <div className="mt-3 hidden grid-cols-[6rem_minmax(0,1fr)_8rem_3rem] items-center gap-4 border-b pb-2 text-xs font-medium text-muted-foreground sm:grid">
                        <span>Date</span>
                        <span>Source</span>
                        <span className="text-right">Amount</span>
                        <span className="sr-only">Actions</span>
                    </div>
                    <ul className="divide-y">
                        {variable.map((row) => (
                            <li
                                key={row.id}
                                className="group grid grid-cols-[minmax(0,1fr)_auto_2.5rem] items-center gap-3 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_8rem_3rem] sm:gap-4 sm:py-2.5"
                            >
                                {/* Date — desktop column / mobile subline */}
                                <span className="hidden whitespace-nowrap text-sm text-muted-foreground sm:block">
                                    {formatExpenseDate(row.date)}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate font-medium sm:font-normal">
                                        {row.source}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                                        {formatExpenseDate(row.date)}
                                    </span>
                                </span>
                                <span className="text-right font-semibold whitespace-nowrap text-positive">
                                    {signed(row.amount)}
                                </span>
                                <span className="flex justify-end opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Delete ${row.source}`}
                                        onClick={() => setDeleting(row)}
                                        disabled={pending}
                                    >
                                        <Trash2 />
                                    </Button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {/* Add income dialog */}
            <Dialog
                open={addOpen}
                onOpenChange={(open) => {
                    if (!open) setAddOpen(false);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add income</DialogTitle>
                    </DialogHeader>
                    <AddIncomeForm
                        defaultDate={`${month}-01`}
                        onCancel={() => setAddOpen(false)}
                        onSuccess={() => {
                            setAddOpen(false);
                            router.refresh();
                        }}
                    />
                </DialogContent>
            </Dialog>

            {/* Delete confirm dialog */}
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
                        <DialogTitle>Delete income?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {deleting
                            ? `"${deleting.source}" will be permanently removed.`
                            : ""}
                    </p>
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
        </div>
    );
}

/** Inline editor for the recurring fixed amount. */
function FixedEditor({
    current,
    onCancel,
    onSaved,
}: {
    current: number;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const [amount, setAmount] = useState(String(current));
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function save() {
        startTransition(async () => {
            const res = await setFixedIncome({ amount });
            if (res.ok) {
                onSaved();
            } else {
                setError(res.fieldErrors?.amount?.[0] ?? res.message);
            }
        });
    }

    return (
        <div className="mt-1">
            <div className="flex items-center gap-1.5">
                <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-label="Fixed monthly income"
                    className="h-9"
                    autoFocus
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Save fixed income"
                    onClick={save}
                    disabled={pending}
                >
                    <Check />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Cancel"
                    onClick={onCancel}
                    disabled={pending}
                >
                    <X />
                </Button>
            </div>
            {error && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

/** The "+ Add income" form — logs a one-off variable income. */
function AddIncomeForm({
    defaultDate,
    onCancel,
    onSuccess,
}: {
    /** Pre-fill the date so new income lands in the month being viewed. */
    defaultDate: string;
    onCancel: () => void;
    onSuccess: () => void;
}) {
    const [source, setSource] = useState("");
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState(defaultDate);
    const [errors, setErrors] = useState<{
        source?: string;
        amount?: string;
        date?: string;
    }>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        startTransition(async () => {
            const res = await addVariableIncome({ source, amount, date });
            if (res.ok) {
                setErrors({});
                setFormError(null);
                onSuccess();
            } else if (res.code === "validation") {
                setErrors({
                    source: res.fieldErrors?.source?.[0],
                    amount: res.fieldErrors?.amount?.[0],
                    date: res.fieldErrors?.date?.[0],
                });
                setFormError(null);
            } else {
                setFormError(res.message);
            }
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            aria-label="Add income"
        >
            <div>
                <Label htmlFor="income-source">Source</Label>
                <Input
                    id="income-source"
                    name="source"
                    type="text"
                    required
                    placeholder="e.g. Freelance — logo"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="mt-1.5"
                />
                {errors.source && (
                    <p className="mt-1 text-sm text-destructive" role="alert">
                        {errors.source}
                    </p>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <Label htmlFor="income-amount">Amount (MXN)</Label>
                    <div className="relative mt-1.5">
                        <span
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-muted-foreground"
                        >
                            $
                        </span>
                        <Input
                            id="income-amount"
                            name="amount"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            required
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="pl-7"
                        />
                    </div>
                    {errors.amount && (
                        <p
                            className="mt-1 text-sm text-destructive"
                            role="alert"
                        >
                            {errors.amount}
                        </p>
                    )}
                </div>
                <div>
                    <Label htmlFor="income-date">Date</Label>
                    <Input
                        id="income-date"
                        name="date"
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="mt-1.5"
                    />
                    {errors.date && (
                        <p
                            className="mt-1 text-sm text-destructive"
                            role="alert"
                        >
                            {errors.date}
                        </p>
                    )}
                </div>
            </div>

            {formError && (
                <p className="text-sm text-destructive" role="alert">
                    {formError}
                </p>
            )}

            <DialogFooter>
                <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={pending}
                >
                    Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                    {pending ? "Saving…" : "Add income"}
                </Button>
            </DialogFooter>
        </form>
    );
}

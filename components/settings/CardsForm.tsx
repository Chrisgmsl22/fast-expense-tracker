"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Lock, Pencil, Plus, Trash2 } from "lucide-react";

import { addCard } from "@/app/_actions/card/add";
import { archiveCard } from "@/app/_actions/card/archive";
import { deleteCard } from "@/app/_actions/card/delete";
import { updateCard } from "@/app/_actions/card/update";
import type { FieldErrors } from "@/lib/actions/result";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import { CARD_PALETTE, isPaletteColor, isValidHex } from "@/lib/palette";
import type { CardSettingsItem } from "@/lib/repositories/card.repository";
import type { AddCardInput, UpdateCardInput } from "@/lib/schemas/card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from "@/components/ui/select";

const DEFAULT_COLOR = CARD_PALETTE[0]?.hex ?? "#6b7280";

/** Display labels for every card type (Cash is a locked, non-addable system card). */
const CARD_TYPE_LABELS: Record<string, string> = {
    credit: "Credit",
    debit: "Debit",
    cash: "Cash",
};

/** Types a user may add — Cash is excluded on purpose (see `addCardTypeSchema`). */
type AddCardType = AddCardInput["type"];
const ADD_TYPE_OPTIONS: ReadonlyArray<{ value: AddCardType; label: string }> = [
    { value: "credit", label: "Credit" },
    { value: "debit", label: "Debit" },
];

function typeLabel(type: string): string {
    return CARD_TYPE_LABELS[type] ?? type;
}

function FieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return (
        <p id={id} role="alert" className="mt-1 text-sm text-destructive">
            {message}
        </p>
    );
}

/** Credit/Debit picker shared by the add + edit forms (Cash is never offered). */
function TypeField({
    id,
    value,
    onType,
}: {
    id: string;
    value: AddCardType;
    onType: (value: AddCardType) => void;
}) {
    return (
        <div>
            <Label htmlFor={id}>Type</Label>
            <Select
                value={value}
                onValueChange={(v) =>
                    onType(
                        ADD_TYPE_OPTIONS.find((o) => o.value === v)?.value ??
                            "credit",
                    )
                }
            >
                <SelectTrigger
                    id={id}
                    aria-label="Card type"
                    className="mt-1.5 w-full"
                >
                    {typeLabel(value)}
                </SelectTrigger>
                <SelectContent>
                    {ADD_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

/**
 * Swatch grid over the shared palette, with the custom `#RRGGBB` field behind an
 * opt-in "advanced" checkbox. The checkbox starts checked when the initial colour
 * isn't a palette swatch (editing a card that already has a custom hex), so the
 * user sees their value; otherwise the hex input stays hidden.
 */
function ColorField({
    color,
    onColor,
    idPrefix,
}: {
    color: string;
    onColor: (value: string) => void;
    idPrefix: string;
}) {
    const normalized = color.trim().toLowerCase();
    const previewValid = isValidHex(normalized);
    const [showCustom, setShowCustom] = useState(() => !isPaletteColor(color));
    return (
        <div>
            <span className="text-sm font-medium">Colour</span>
            <div
                role="group"
                aria-label="Colour swatches"
                className="mt-1.5 flex flex-wrap gap-2"
            >
                {CARD_PALETTE.map((swatch) => (
                    <button
                        key={swatch.hex}
                        type="button"
                        aria-label={swatch.name}
                        aria-pressed={normalized === swatch.hex}
                        onClick={() => onColor(swatch.hex)}
                        style={{ backgroundColor: swatch.hex }}
                        className={cn(
                            "size-7 rounded-md border border-black/10 transition",
                            normalized === swatch.hex &&
                                "ring-2 ring-ring ring-offset-2 ring-offset-background",
                        )}
                    />
                ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
                <Checkbox
                    id={`${idPrefix}-custom-toggle`}
                    checked={showCustom}
                    onCheckedChange={(checked) =>
                        setShowCustom(checked === true)
                    }
                />
                <Label
                    htmlFor={`${idPrefix}-custom-toggle`}
                    className="text-sm"
                >
                    Enter a custom color
                </Label>
            </div>

            {showCustom && (
                <div className="mt-2 flex items-center gap-2">
                    <span
                        aria-hidden
                        className="size-6 shrink-0 rounded-md border"
                        style={{
                            backgroundColor: previewValid
                                ? normalized
                                : "transparent",
                        }}
                    />
                    <Input
                        id={`${idPrefix}-color`}
                        aria-label="Custom colour"
                        value={color}
                        onChange={(e) => onColor(e.target.value)}
                        placeholder="#7c3aed"
                        className="w-32 font-mono"
                    />
                </div>
            )}
        </div>
    );
}

/** The revealed "Add card" form: name + type + colour. */
function AddCardForm({ onDone }: { onDone: () => void }) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [type, setType] = useState<AddCardType>("credit");
    const [color, setColor] = useState(DEFAULT_COLOR);
    const [errors, setErrors] = useState<FieldErrors<AddCardInput>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        startTransition(async () => {
            try {
                const res = await addCard({ name, type, color });
                if (res.ok) {
                    router.refresh();
                    onDone();
                } else {
                    setErrors(res.fieldErrors ?? {});
                    setFormError(res.message);
                }
            } catch {
                setFormError("Something went wrong adding the card.");
            }
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            aria-label="Add card"
            className="space-y-4 rounded-lg border bg-muted/30 p-4"
        >
            <div>
                <Label htmlFor="add-card-name">Card name</Label>
                <Input
                    id="add-card-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Amex Gold"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={
                        errors.name ? "add-card-name-error" : undefined
                    }
                    className="mt-1.5"
                />
                <FieldError
                    id="add-card-name-error"
                    message={errors.name?.[0]}
                />
            </div>

            <TypeField id="add-card-type" value={type} onType={setType} />

            <ColorField color={color} onColor={setColor} idPrefix="add-card" />

            {formError && (
                <p className="text-sm text-destructive" role="alert">
                    {formError}
                </p>
            )}

            <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                    {pending ? "Adding…" : "Add card"}
                </Button>
            </div>
        </form>
    );
}

/**
 * Expanded edit row: rename / recolor / retype, plus removal. Used cards Archive
 * one-click (reversible via Restore); unused cards Delete behind a confirmation
 * dialog (a hard delete can't be undone).
 */
function EditCardRow({
    card,
    onDone,
}: {
    card: CardSettingsItem;
    onDone: () => void;
}) {
    const router = useRouter();
    const [name, setName] = useState(card.name);
    // Cash is never editable, so the current type is always credit/debit here.
    const [type, setType] = useState<AddCardType>(
        card.type === "debit" ? "debit" : "credit",
    );
    const [color, setColor] = useState(card.color);
    const [errors, setErrors] = useState<FieldErrors<UpdateCardInput>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [pending, startTransition] = useTransition();

    function handleSave(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        startTransition(async () => {
            try {
                const res = await updateCard({
                    id: card.id,
                    name,
                    type,
                    color,
                });
                if (res.ok) {
                    router.refresh();
                    onDone();
                } else {
                    setErrors(res.fieldErrors ?? {});
                    setFormError(res.message);
                }
            } catch {
                setFormError("Something went wrong saving the card.");
            }
        });
    }

    function archive() {
        startTransition(async () => {
            try {
                const res = await archiveCard({ id: card.id });
                if (res.ok) {
                    router.refresh();
                    onDone();
                } else {
                    setFormError(res.message);
                }
            } catch {
                setFormError("Something went wrong archiving the card.");
            }
        });
    }

    function confirmDelete() {
        startTransition(async () => {
            try {
                const res = await deleteCard({ id: card.id });
                if (res.ok) {
                    router.refresh();
                    onDone();
                } else {
                    setConfirmingDelete(false);
                    setFormError(res.message);
                }
            } catch {
                setConfirmingDelete(false);
                setFormError("Something went wrong deleting the card.");
            }
        });
    }

    return (
        <>
            <form
                onSubmit={handleSave}
                aria-label={`Edit ${card.name}`}
                className="space-y-4 border-b py-4 last:border-b-0"
            >
                <div>
                    <Label htmlFor={`edit-card-name-${card.id}`}>
                        Card name
                    </Label>
                    <Input
                        id={`edit-card-name-${card.id}`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={
                            errors.name
                                ? `edit-card-name-${card.id}-error`
                                : undefined
                        }
                        className="mt-1.5"
                    />
                    <FieldError
                        id={`edit-card-name-${card.id}-error`}
                        message={errors.name?.[0]}
                    />
                </div>

                <TypeField
                    id={`edit-card-type-${card.id}`}
                    value={type}
                    onType={setType}
                />

                <ColorField
                    color={color}
                    onColor={setColor}
                    idPrefix={`edit-card-${card.id}`}
                />

                {formError && (
                    <p className="text-sm text-destructive" role="alert">
                        {formError}
                    </p>
                )}

                <div className="flex items-center justify-between gap-2">
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={pending}
                        onClick={
                            card.inUse
                                ? archive
                                : () => setConfirmingDelete(true)
                        }
                    >
                        {card.inUse ? (
                            <>
                                <Archive className="size-3.5" aria-hidden />
                                Archive
                            </>
                        ) : (
                            <>
                                <Trash2 className="size-3.5" aria-hidden />
                                Delete
                            </>
                        )}
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" onClick={onDone}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? "Saving…" : "Save changes"}
                        </Button>
                    </div>
                </div>
            </form>

            <Dialog
                open={confirmingDelete}
                onOpenChange={(open) => {
                    if (!open) setConfirmingDelete(false);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {card.name}?</DialogTitle>
                        <DialogDescription>
                            This can&apos;t be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmingDelete(false)}
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

/** A read-only card row: colour dot, name, type, and the right-hand control. */
function DisplayRow({
    card,
    onEdit,
}: {
    card: CardSettingsItem;
    onEdit: () => void;
}) {
    const isCash = card.type === "cash";
    const isArchived = card.archivedAt !== null;
    return (
        <div
            className={cn(
                "flex items-center gap-3 border-b py-2.5 last:border-b-0",
                isArchived && "opacity-60",
            )}
        >
            <span
                aria-hidden
                className="size-4 shrink-0 rounded-md"
                style={{ backgroundColor: card.color }}
            />
            <span className="text-sm">{card.name}</span>
            <span className="text-xs text-muted-foreground">
                {typeLabel(card.type)}
            </span>
            <div className="ml-auto flex items-center gap-2">
                {isArchived ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Archived
                    </span>
                ) : isCash ? (
                    <span
                        className="inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: card.color }}
                    >
                        <Lock className="size-3" aria-hidden />
                        locked
                    </span>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onEdit}
                        aria-label={`Edit ${card.name}`}
                    >
                        <Pencil className="size-3.5" aria-hidden />
                        Edit
                    </Button>
                )}
            </div>
        </div>
    );
}

/**
 * The Settings "Cards" section (spec 0006 §6). Lists the user's cards
 * and drives add / rename / recolor / archive / delete through IDOR-safe server
 * actions. The Cash card is locked (no controls); used cards archive while unused
 * ones delete, chosen up front from each card's `inUse` flag. Active cards are
 * capped at `MAX_ACTIVE_CARDS`; at the cap the Add button is disabled.
 */
export function CardsForm({ cards }: { cards: CardSettingsItem[] }) {
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const activeCount = cards.filter((c) => c.archivedAt === null).length;
    const atCap = activeCount >= MAX_ACTIVE_CARDS;

    return (
        <section aria-label="Cards" className="rounded-xl border p-5">
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Cards</h2>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={atCap || adding}
                    onClick={() => {
                        setAdding(true);
                        setEditingId(null);
                    }}
                >
                    <Plus className="size-4" aria-hidden />
                    Add card
                </Button>
            </div>

            {atCap && !adding && (
                <p className="mt-1 text-xs text-muted-foreground">
                    You&apos;ve reached the {MAX_ACTIVE_CARDS}-card limit.
                    Archive one to add another.
                </p>
            )}

            {adding && (
                <div className="mt-4">
                    <AddCardForm onDone={() => setAdding(false)} />
                </div>
            )}

            <div className="mt-4">
                {cards.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No cards yet — add your first one.
                    </p>
                ) : (
                    cards.map((card) =>
                        editingId === card.id ? (
                            <EditCardRow
                                key={card.id}
                                card={card}
                                onDone={() => setEditingId(null)}
                            />
                        ) : (
                            <DisplayRow
                                key={card.id}
                                card={card}
                                onEdit={() => {
                                    setEditingId(card.id);
                                    setAdding(false);
                                }}
                            />
                        ),
                    )
                )}
            </div>
        </section>
    );
}

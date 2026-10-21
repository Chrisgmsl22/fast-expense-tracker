"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Lock, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMessages, useTranslations } from "next-intl";

import { addCard } from "@/app/_actions/card/add";
import { archiveCard } from "@/app/_actions/card/archive";
import { deleteCard } from "@/app/_actions/card/delete";
import { restoreCard } from "@/app/_actions/card/restore";
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

/** Types a user may add — Cash is excluded on purpose (see `addCardTypeSchema`). */
type AddCardType = AddCardInput["type"];
const ADD_TYPES: readonly AddCardType[] = ["credit", "debit"];

/** Display label for every card type (Cash is a locked, non-addable system card). */
function useTypeLabel(): (type: string) => string {
    const t = useTranslations("settings.cards.types");
    return (type) =>
        type === "credit" || type === "debit" || type === "cash"
            ? t(type)
            : type;
}

/** Palette names are English data in lib/palette.ts; a name with no key shows as written. */
function useSwatchName(): (name: string) => string {
    const names: Readonly<Record<string, string>> =
        useMessages().settings.cards.swatches;
    return (name) => names[name] ?? name;
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
    const t = useTranslations("settings.cards");
    const typeLabel = useTypeLabel();
    return (
        <div>
            <Label htmlFor={id}>{t("type")}</Label>
            <Select
                value={value}
                onValueChange={(v) =>
                    onType(ADD_TYPES.find((type) => type === v) ?? "credit")
                }
            >
                <SelectTrigger
                    id={id}
                    aria-label={t("typeAria")}
                    className="mt-1.5 w-full"
                >
                    {typeLabel(value)}
                </SelectTrigger>
                <SelectContent>
                    {ADD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                            {typeLabel(type)}
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
    error,
}: {
    color: string;
    onColor: (value: string) => void;
    idPrefix: string;
    error?: string;
}) {
    const t = useTranslations("settings.cards");
    const swatchName = useSwatchName();
    const normalized = color.trim().toLowerCase();
    const previewValid = isValidHex(normalized);
    const [showCustom, setShowCustom] = useState(() => !isPaletteColor(color));
    const errorId = `${idPrefix}-color-error`;
    const describedBy = error ? errorId : undefined;
    return (
        <div>
            <span className="text-sm font-medium">{t("color")}</span>
            <div
                role="group"
                aria-label={t("swatchesAria")}
                aria-describedby={describedBy}
                className="mt-1.5 flex flex-wrap gap-2"
            >
                {CARD_PALETTE.map((swatch) => (
                    <button
                        key={swatch.hex}
                        type="button"
                        aria-label={swatchName(swatch.name)}
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
                    onCheckedChange={(checked) => {
                        const on = checked === true;
                        setShowCustom(on);
                        // Unchecking hides the hex field, so snap the value back to
                        // a definite swatch — otherwise a now-invisible custom hex
                        // would still be what gets submitted, with no swatch shown
                        // as selected.
                        if (!on) onColor(DEFAULT_COLOR);
                    }}
                />
                <Label
                    htmlFor={`${idPrefix}-custom-toggle`}
                    className="text-sm"
                >
                    {t("customToggle")}
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
                        aria-label={t("hexAria")}
                        value={color}
                        onChange={(e) => onColor(e.target.value)}
                        placeholder="#RRGGBB"
                        aria-invalid={Boolean(error)}
                        aria-describedby={describedBy}
                        className="w-32 font-mono"
                    />
                </div>
            )}
            <FieldError id={errorId} message={error} />
        </div>
    );
}

/** The revealed "Add card" form: name + type + colour. */
function AddCardForm({ onDone }: { onDone: () => void }) {
    const t = useTranslations("settings.cards");
    const tc = useTranslations("common.actions");
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
                setFormError(t("unexpected.add"));
            }
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            aria-label={t("add")}
            className="space-y-4 rounded-lg border bg-muted/30 p-4"
        >
            <p className="text-xs text-muted-foreground">
                {t("limitHint", { max: MAX_ACTIVE_CARDS })}
            </p>

            <div>
                <Label htmlFor="add-card-name">{t("name")}</Label>
                <Input
                    id="add-card-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("namePlaceholder")}
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

            <ColorField
                color={color}
                onColor={setColor}
                idPrefix="add-card"
                error={errors.color?.[0]}
            />

            {formError && (
                <p className="text-sm text-destructive" role="alert">
                    {formError}
                </p>
            )}

            <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onDone}>
                    {tc("cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                    {pending ? t("adding") : t("add")}
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
    const t = useTranslations("settings");
    const tc = useTranslations("common.actions");
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
                setFormError(t("cards.unexpected.save"));
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
                setFormError(t("cards.unexpected.archive"));
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
                setFormError(t("cards.unexpected.delete"));
            }
        });
    }

    return (
        <>
            <form
                onSubmit={handleSave}
                aria-label={t("cards.editAria", { name: card.name })}
                className="space-y-4 border-b py-4 last:border-b-0"
            >
                <div>
                    <Label htmlFor={`edit-card-name-${card.id}`}>
                        {t("cards.name")}
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
                    error={errors.color?.[0]}
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
                                {t("cards.archive")}
                            </>
                        ) : (
                            <>
                                <Trash2 className="size-3.5" aria-hidden />
                                {tc("delete")}
                            </>
                        )}
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" onClick={onDone}>
                            {tc("cancel")}
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending
                                ? t("saveButton.saving")
                                : t("saveButton.save")}
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
                        <DialogTitle>
                            {t("cards.deleteTitle", { name: card.name })}
                        </DialogTitle>
                        <DialogDescription>
                            {t("cards.deleteDescription")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmingDelete(false)}
                            disabled={pending}
                        >
                            {tc("cancel")}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={pending}
                        >
                            {pending ? t("cards.deleting") : tc("delete")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/** A read-only ACTIVE card row: colour dot, name, type, and the right-hand control. */
function DisplayRow({
    card,
    onEdit,
}: {
    card: CardSettingsItem;
    onEdit: () => void;
}) {
    const t = useTranslations("settings.cards");
    const tc = useTranslations("common.actions");
    const typeLabel = useTypeLabel();
    const isCash = card.type === "cash";
    return (
        <div className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
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
                {isCash ? (
                    <span
                        className="inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: card.color }}
                    >
                        <Lock className="size-3" aria-hidden />
                        {t("locked")}
                    </span>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onEdit}
                        aria-label={t("editAria", { name: card.name })}
                    >
                        <Pencil className="size-3.5" aria-hidden />
                        {tc("edit")}
                    </Button>
                )}
            </div>
        </div>
    );
}

/**
 * A read-only ARCHIVED card row: muted, with a single Restore control. Restore
 * blocks when an active card already holds this name; that server message is
 * surfaced inline on the row so the user knows to rename/archive the other one.
 */
function ArchivedRow({ card }: { card: CardSettingsItem }) {
    const t = useTranslations("settings.cards");
    const typeLabel = useTypeLabel();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function handleRestore() {
        setError(null);
        startTransition(async () => {
            try {
                const res = await restoreCard({ id: card.id });
                if (res.ok) {
                    router.refresh();
                } else {
                    setError(res.message);
                }
            } catch {
                setError(t("unexpected.restore"));
            }
        });
    }

    return (
        <div className="border-b py-2.5 last:border-b-0">
            <div className="flex items-center gap-3">
                <span
                    aria-hidden
                    className="size-4 shrink-0 rounded-md opacity-60"
                    style={{ backgroundColor: card.color }}
                />
                <span className="text-sm text-muted-foreground">
                    {card.name}
                </span>
                <span className="text-xs text-muted-foreground">
                    {typeLabel(card.type)}
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={handleRestore}
                    disabled={pending}
                    aria-label={t("restoreAria", { name: card.name })}
                >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {pending ? t("restoring") : t("restore")}
                </Button>
            </div>
            {error && (
                <p className="mt-1.5 text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

/**
 * The Settings "Cards" section (spec 0006 §6). Lists the user's active cards
 * (Cash pinned last) and drives add / rename / recolor / archive / delete through
 * IDOR-safe server actions. The Cash card is locked (no controls); used cards
 * archive (reversible) while unused ones delete (confirmed). Archived cards live
 * in a de-emphasized section below with a one-click Restore. Active cards are
 * capped at `MAX_ACTIVE_CARDS`; at the cap the Add button is disabled.
 */
export function CardsForm({ cards }: { cards: CardSettingsItem[] }) {
    const t = useTranslations("settings.cards");
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // `listForSettings` already returns active-first (Cash last), then archived.
    const active = cards.filter((c) => c.archivedAt === null);
    const archived = cards.filter((c) => c.archivedAt !== null);
    const atCap = active.length >= MAX_ACTIVE_CARDS;

    return (
        <section
            id="cards"
            aria-label={t("title")}
            className="scroll-mt-20 rounded-xl border p-5"
        >
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">{t("title")}</h2>
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
                    {t("add")}
                </Button>
            </div>

            {atCap && !adding && (
                <p className="mt-1 text-xs text-muted-foreground">
                    {t("atCap", { max: MAX_ACTIVE_CARDS })}
                </p>
            )}

            {adding && (
                <div className="mt-4">
                    <AddCardForm onDone={() => setAdding(false)} />
                </div>
            )}

            <div className="mt-4">
                {active.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t("empty")}
                    </p>
                ) : (
                    active.map((card) =>
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

            {archived.length > 0 && (
                <div className="mt-6 border-t pt-4">
                    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {t("archivedHeading")}
                    </h3>
                    <div className="mt-1">
                        {archived.map((card) => (
                            <ArchivedRow key={card.id} card={card} />
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

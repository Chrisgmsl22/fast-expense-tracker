"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    addPartnerDebt,
    type AddPartnerDebtResult,
} from "@/app/_actions/movement/add-partner-debt";
import {
    updatePartnerDebt,
    type UpdatePartnerDebtResult,
} from "@/app/_actions/movement/update-partner-debt";
import type { FieldErrors } from "@/lib/actions/result";
import { getTodayCdmx } from "@/lib/dates";
import type { PartnerDebtInput } from "@/lib/schemas/movement";
import type { PartnerDebtDirection } from "@/lib/domain/movement";
import { debtLabel } from "./movement-display";

/** Prefilled fields when the form edits an existing debt (strings for inputs). */
export type PartnerDebtEditable = {
    id: string;
    date: string;
    amount: string;
    note: string;
    direction?: PartnerDebtDirection;
};

type Props = {
    /** When present, the form edits this debt instead of creating a new one. */
    debt?: PartnerDebtEditable;
    direction?: PartnerDebtDirection;
    partnerName: string;
    onSuccess?: () => void;
    onCancel?: () => void;
};

/**
 * Record a settlement-only debt in either direction (spec 0007). The amount is
 * the full debt that the named person owes, never a purchase total to split.
 */
export function PartnerDebtForm({
    debt,
    direction = debt?.direction ?? "gf_fronted",
    partnerName,
    onSuccess,
    onCancel,
}: Props) {
    const t = useTranslations("movements");
    const tc = useTranslations("common.actions");
    const partnerOwes = direction === "partner_debt";
    const values = { partner: partnerName };
    const [date, setDate] = useState(debt?.date ?? "");
    const [amount, setAmount] = useState(debt?.amount ?? "");
    const [note, setNote] = useState(debt?.note ?? "");

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<PartnerDebtInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        startTransition(async () => {
            try {
                const res: AddPartnerDebtResult | UpdatePartnerDebtResult = debt
                    ? await updatePartnerDebt({
                          id: debt.id,
                          direction,
                          date,
                          amount,
                          note: note || undefined,
                      })
                    : await addPartnerDebt({
                          direction,
                          date,
                          amount,
                          note: note || undefined,
                      });
                if (res.ok) {
                    setErrors({});
                    setFormError(null);
                    form.reset();
                    setDate("");
                    setAmount("");
                    setNote("");
                    onSuccess?.();
                } else {
                    setErrors(res.fieldErrors ?? {});
                    setFormError(res.message);
                }
            } catch {
                setFormError(t("debt.unexpected"));
            }
        });
    }

    const fieldError = (name: keyof PartnerDebtInput) => {
        const msg = errors[name]?.[0];
        return msg ? (
            <p className="mt-1 text-sm text-destructive" role="alert">
                {msg}
            </p>
        ) : null;
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            aria-label={
                debt
                    ? partnerOwes
                        ? t("debt.formEditPartnerOwes", values)
                        : t("debt.formEditYouOwe", values)
                    : partnerOwes
                      ? t("debt.formLogPartnerOwes", values)
                      : t("debt.formLogYouOwe", values)
            }
        >
            <p className="text-sm text-muted-foreground">
                {partnerOwes
                    ? t("debt.blurbPartnerOwes", values)
                    : t("debt.blurbYouOwe", values)}
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                    <Label htmlFor="debt-date">{t("form.date")}</Label>
                    <Input
                        id="debt-date"
                        name="date"
                        type="date"
                        max={getTodayCdmx()}
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="mt-1.5"
                    />
                    {fieldError("date")}
                </div>
                <div className="sm:col-span-2">
                    <Label htmlFor="debt-amount">
                        {partnerOwes
                            ? t("debt.amountPartnerOwes", values)
                            : t("debt.amountYouOwe", values)}
                    </Label>
                    {/* The $500 carwash: he typed what SHE paid because the
                        question was ambiguous. Say whose figure this is, at the
                        field, not only in a heading the form may not show. */}
                    <p
                        id="debt-amount-help"
                        className="mt-0.5 text-xs text-muted-foreground"
                    >
                        {partnerOwes
                            ? t("debt.helpPartnerOwes")
                            : t("debt.helpYouOwe", values)}
                    </p>
                    <div className="relative mt-1.5">
                        <span
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                        >
                            $
                        </span>
                        <Input
                            id="debt-amount"
                            name="amount"
                            aria-describedby="debt-amount-help"
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
                    {fieldError("amount")}
                </div>
            </div>

            <div>
                <Label htmlFor="debt-note">
                    {t("form.note")}{" "}
                    <span className="font-normal text-muted-foreground">
                        {t("form.optional")}
                    </span>
                </Label>
                <Input
                    id="debt-note"
                    name="note"
                    type="text"
                    placeholder={debtLabel(direction, partnerName, t)}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1.5"
                />
            </div>

            {formError && (
                <p className="text-sm text-destructive" role="alert">
                    {formError}
                </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                {onCancel ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={pending}
                    >
                        {tc("cancel")}
                    </Button>
                ) : null}
                <Button type="submit" disabled={pending}>
                    {pending
                        ? t("form.saving")
                        : debt
                          ? t("form.saveChanges")
                          : t("debt.submit")}
                </Button>
            </div>
        </form>
    );
}

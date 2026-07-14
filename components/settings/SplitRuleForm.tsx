"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    saveSplitRule,
    type SaveSplitRuleResult,
} from "@/app/_actions/settings/save-split-rule";
import type { FieldErrors } from "@/lib/actions/result";
import type { SplitRuleInput } from "@/lib/schemas/settings";

type Props = {
    /** Current shared-expense mode. */
    sharesExpenses: boolean;
    /** Current stored partner name (null in Solo mode). */
    partnerName: string | null;
    /** Current share, as a fraction (0.68 = 68%). */
    defaultSharePercentage: number;
};

/**
 * The Settings "Expense split rule" block (spec 0006 / CHORE-6.a). An opt-in
 * "I share expenses" toggle that, when on, reveals + requires a partner name and
 * your share %. The single source of truth for shared-vs-solo mode: the partner
 * machinery elsewhere in the app derives from the stored `sharesExpenses` flag.
 * Validated server-side; field errors render per input.
 */
export function SplitRuleForm({
    sharesExpenses,
    partnerName,
    defaultSharePercentage,
}: Props) {
    const router = useRouter();
    const [shares, setShares] = useState(sharesExpenses);
    const [name, setName] = useState(partnerName ?? "");
    const [percent, setPercent] = useState(
        String(Math.round(defaultSharePercentage * 100)),
    );

    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<SplitRuleInput>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    // Clamp for the preview only; the server is the validation source of truth.
    const yourShare = Math.min(100, Math.max(0, Number(percent) || 0));
    const partnerShare = 100 - yourShare;

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        startTransition(async () => {
            try {
                const res: SaveSplitRuleResult = await saveSplitRule({
                    sharesExpenses: shares,
                    partnerName: name,
                    sharePercentage: percent,
                });
                if (res.ok) {
                    setErrors({});
                    setFormError(null);
                    setSaved(true);
                    router.refresh();
                } else {
                    setSaved(false);
                    setErrors(res.fieldErrors ?? {});
                    setFormError(res.message);
                }
            } catch {
                setSaved(false);
                setFormError("Something went wrong saving your settings.");
            }
        });
    }

    const fieldError = (name: keyof SplitRuleInput) => {
        const msg = errors[name]?.[0];
        return msg ? (
            <p
                id={`split-${name}-error`}
                className="mt-1 text-sm text-destructive"
                role="alert"
            >
                {msg}
            </p>
        ) : null;
    };

    return (
        <form
            onSubmit={handleSubmit}
            aria-label="Expense split rule"
            className="rounded-xl border p-5"
        >
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">Expense split rule</h2>
                <span className="text-xs text-muted-foreground">
                    applies to shared expenses
                </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
                Turn this on if you split expenses with a partner. It reveals
                the split controls across the app; leave it off for a plain
                tracker.
            </p>

            <div className="mt-4 flex items-center gap-3">
                <Checkbox
                    id="shares-toggle"
                    checked={shares}
                    onCheckedChange={(checked) => {
                        setShares(checked === true);
                        setSaved(false);
                    }}
                />
                <Label htmlFor="shares-toggle" className="text-sm font-medium">
                    I share expenses
                </Label>
            </div>

            {shares && (
                <div className="mt-5 space-y-5 border-t pt-5">
                    <div>
                        <Label htmlFor="partner-name">Partner name</Label>
                        <Input
                            id="partner-name"
                            name="partnerName"
                            type="text"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setSaved(false);
                            }}
                            placeholder="e.g. Alex"
                            aria-invalid={Boolean(errors.partnerName)}
                            aria-describedby={
                                errors.partnerName
                                    ? "split-partnerName-error"
                                    : undefined
                            }
                            className="mt-1.5"
                        />
                        {fieldError("partnerName")}
                    </div>

                    <div>
                        <div className="flex items-baseline justify-between">
                            <Label htmlFor="share-percentage">Your share</Label>
                            <span className="text-sm font-semibold tabular-nums">
                                {yourShare}%
                            </span>
                        </div>
                        <Input
                            id="share-percentage"
                            name="sharePercentage"
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="100"
                            step="1"
                            required
                            value={percent}
                            onChange={(e) => {
                                setPercent(e.target.value);
                                setSaved(false);
                            }}
                            aria-invalid={Boolean(errors.sharePercentage)}
                            aria-describedby={
                                errors.sharePercentage
                                    ? "split-sharePercentage-error"
                                    : undefined
                            }
                            className="mt-1.5 w-28"
                        />
                        {fieldError("sharePercentage")}
                        {/* Two-segment preview of how a shared expense splits. */}
                        <div className="mt-3 flex h-8 overflow-hidden rounded-md text-xs font-semibold">
                            <div
                                className="flex items-center justify-center bg-foreground text-background"
                                style={{ width: `${yourShare}%` }}
                            >
                                {yourShare >= 12 ? `You ${yourShare}%` : ""}
                            </div>
                            <div
                                className="flex items-center justify-center bg-muted text-muted-foreground"
                                style={{ width: `${partnerShare}%` }}
                            >
                                {partnerShare >= 12
                                    ? `Partner ${partnerShare}%`
                                    : ""}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {formError && (
                <p className="mt-4 text-sm text-destructive" role="alert">
                    {formError}
                </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
                {saved && !pending && (
                    <span
                        className="text-sm text-muted-foreground"
                        role="status"
                    >
                        Saved
                    </span>
                )}
                <Button type="submit" disabled={pending}>
                    {pending ? "Saving…" : "Save changes"}
                </Button>
            </div>
        </form>
    );
}

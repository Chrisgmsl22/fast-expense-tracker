"use client";

import {
    useEffect,
    useRef,
    useState,
    useTransition,
    type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    saveBudgetRule,
    type SaveBudgetRuleResult,
} from "@/app/_actions/settings/save-budget-rule";
import type { FieldErrors } from "@/lib/actions/result";
import type { BucketKey } from "@/lib/domain/dashboard";
import { DEFAULT_BUDGET_RULE, type BudgetRule } from "@/lib/domain/budget-rule";
import { formatMonthLabel } from "@/lib/format";
import type { BudgetRuleInput } from "@/lib/schemas/budget-rule";

type Props = {
    /** The rule in force for the current month. */
    rule: BudgetRule;
    /** The current month's label, e.g. "September 2026". */
    monthLabel: string;
};

type Draft = Record<BucketKey, string>;

const FIELDS: { key: BucketKey; label: string; border: string }[] = [
    {
        key: "essentials",
        label: "Essentials",
        border: "border-t-bucket-essentials",
    },
    {
        key: "discretionary",
        label: "Discretionary",
        border: "border-t-bucket-discretionary",
    },
    { key: "savings", label: "Savings/Inv", border: "border-t-bucket-savings" },
];

function toDraft(rule: BudgetRule): Draft {
    return {
        essentials: String(rule.essentials),
        discretionary: String(rule.discretionary),
        savings: String(rule.savings),
    };
}

function totalLine(total: number): string {
    if (total === 100) return "Total 100%";
    return total < 100
        ? `Total ${total}% · ${100 - total}% left to assign`
        : `Total ${total}% · ${total - 100}% over 100%`;
}

export function BudgetRuleForm({ rule, monthLabel }: Props) {
    const router = useRouter();
    const [draft, setDraft] = useState<Draft>(() => toDraft(rule));
    // The action picks the month from its own clock; show that one after a save.
    const [inForce, setInForce] = useState({ rule, monthLabel });
    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<BudgetRuleInput>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    // How long the button stays in its green "✓ Saved" state after a save.
    const SAVED_WINDOW_MS = 1600;
    const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearRevertTimer = () => {
        if (revertTimer.current !== null) {
            clearTimeout(revertTimer.current);
            revertTimer.current = null;
        }
    };

    useEffect(() => clearRevertTimer, []);

    const edit = (next: Draft) => {
        clearRevertTimer();
        setSaved(false);
        setFormError(null);
        setDraft(next);
    };

    const editField = (key: BucketKey, value: string) => {
        setErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
        edit({ ...draft, [key]: value });
    };

    const total = FIELDS.reduce(
        (sum, { key }) => sum + (Number(draft[key]) || 0),
        0,
    );

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        clearRevertTimer();
        startTransition(async () => {
            try {
                const res: SaveBudgetRuleResult = await saveBudgetRule(draft);
                if (res.ok) {
                    setErrors({});
                    setFormError(null);
                    setInForce({
                        rule: res.data.rule,
                        monthLabel: formatMonthLabel(res.data.effectiveMonth),
                    });
                    setSaved(true);
                    revertTimer.current = setTimeout(() => {
                        setSaved(false);
                        revertTimer.current = null;
                    }, SAVED_WINDOW_MS);
                    router.refresh();
                } else {
                    setSaved(false);
                    setErrors(res.fieldErrors ?? {});
                    setFormError(res.message);
                }
            } catch {
                setSaved(false);
                setFormError("Something went wrong saving your budget rule.");
            }
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            aria-label="Budget rule"
            className="rounded-xl border p-5"
        >
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">Budget rule</h2>
                <span className="text-xs text-muted-foreground">
                    In force for {inForce.monthLabel}: {inForce.rule.essentials}{" "}
                    / {inForce.rule.discretionary} / {inForce.rule.savings}
                </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
                How your income splits across the three buckets. The three must
                total 100%. A change applies from {inForce.monthLabel} onward;
                past months keep the split they had.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {FIELDS.map(({ key, label, border }) => (
                    <div
                        key={key}
                        className={`rounded-lg border border-t-4 ${border} p-3`}
                    >
                        <Label htmlFor={`budget-${key}`}>{label} (%)</Label>
                        <Input
                            id={`budget-${key}`}
                            name={key}
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="100"
                            step="1"
                            required
                            value={draft[key]}
                            onChange={(e) => editField(key, e.target.value)}
                            aria-invalid={Boolean(errors[key])}
                            aria-describedby={
                                errors[key] ? `budget-${key}-error` : undefined
                            }
                            className="mt-1.5"
                        />
                        {errors[key]?.[0] && (
                            <p
                                id={`budget-${key}-error`}
                                className="mt-1 text-sm text-destructive"
                                role="alert"
                            >
                                {errors[key][0]}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            <p
                className={`mt-3 text-sm tabular-nums ${total === 100 ? "text-muted-foreground" : "text-destructive"}`}
                aria-live="polite"
            >
                {totalLine(total)}
            </p>

            {formError && (
                <p className="mt-4 text-sm text-destructive" role="alert">
                    {formError}
                </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                        setErrors({});
                        edit(toDraft(DEFAULT_BUDGET_RULE));
                    }}
                >
                    Reset to {DEFAULT_BUDGET_RULE.essentials}/
                    {DEFAULT_BUDGET_RULE.discretionary}/
                    {DEFAULT_BUDGET_RULE.savings}
                </Button>
                <Button
                    type="submit"
                    disabled={pending || saved}
                    aria-live="polite"
                    className={
                        saved && !pending ? "bg-positive text-white" : undefined
                    }
                >
                    {saved && !pending ? (
                        <>
                            <Check className="size-4" aria-hidden="true" />
                            Saved
                        </>
                    ) : pending ? (
                        "Saving…"
                    ) : (
                        "Save changes"
                    )}
                </Button>
            </div>
        </form>
    );
}

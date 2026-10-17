"use client";

import type { FormEvent } from "react";

import { saveBudgetRule } from "@/app/_actions/settings/save-budget-rule";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBudgetTotal } from "@/lib/format";
import type { BudgetRuleInput } from "@/lib/schemas/budget-rule";
import { cn } from "@/lib/utils";

import { FieldMessage } from "./FieldMessage";
import {
    BUCKETS,
    barPercent,
    budgetDraftTotal,
    type BudgetDraft,
    type StepNav,
} from "./onboarding-model";
import { WIZARD_FAINT_TEXT_CLASS } from "./onboarding-styles";
import { ResponsiveText } from "./ResponsiveText";
import { StepFooter } from "./StepFooter";
import { StepFrame } from "./StepFrame";
import { useStepSubmit } from "./use-step-submit";

const FORM_ID = "onboarding-budget-form";
const FIELDS = ["essentials", "discretionary", "savings"] as const;

type Props = StepNav & {
    draft: BudgetDraft;
    onChange: (draft: BudgetDraft) => void;
};

export function BudgetStep({
    headingRef,
    onBack,
    onNext,
    draft,
    onChange,
}: Props) {
    const { pending, formError, formRef, announcedField, fieldError, submit } =
        useStepSubmit<BudgetRuleInput>(FIELDS);
    const total = budgetDraftTotal(draft);

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        submit(
            () => saveBudgetRule(draft),
            () => onNext(),
        );
    }

    return (
        <StepFrame
            headingRef={headingRef}
            title="Your budgeting rule"
            description={
                <ResponsiveText
                    desktop="We default to 50/25/25. Keep it, or tweak — it always totals 100%."
                    phone="Default 50/25/25. Keep it or tweak."
                />
            }
            footer={
                <StepFooter
                    onBack={onBack}
                    onSkip={onNext}
                    skipLabel={
                        <ResponsiveText
                            desktop="Skip — use default"
                            phone="Skip"
                        />
                    }
                    primaryLabel="Continue"
                    pendingLabel="Saving…"
                    pending={pending}
                    formId={FORM_ID}
                />
            }
        >
            <form id={FORM_ID} ref={formRef} onSubmit={handleSubmit} noValidate>
                {BUCKETS.map(({ key, label, helper, accent, fill }) => {
                    const error = fieldError(key);
                    const errorId = `onboarding-budget-${key}-error`;
                    return (
                        <div
                            key={key}
                            className={cn(
                                "mb-[11px] rounded-xl border border-t-[3px] p-[13px]",
                                accent,
                            )}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <Label
                                        htmlFor={`onboarding-budget-${key}`}
                                        className="text-[13px] font-semibold text-foreground"
                                    >
                                        {label}
                                    </Label>
                                    <p
                                        className={cn(
                                            "mt-0.5 hidden text-[11px] sm:block",
                                            WIZARD_FAINT_TEXT_CLASS,
                                        )}
                                    >
                                        {helper}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 text-[13px] font-semibold">
                                    <Input
                                        id={`onboarding-budget-${key}`}
                                        name={key}
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={draft[key]}
                                        onChange={(e) =>
                                            onChange({
                                                ...draft,
                                                [key]: e.target.value,
                                            })
                                        }
                                        aria-invalid={error ? true : undefined}
                                        aria-describedby={
                                            error ? errorId : undefined
                                        }
                                        className="h-8 w-16 rounded-lg text-right"
                                    />
                                    <span aria-hidden="true">%</span>
                                </div>
                            </div>
                            <div
                                aria-hidden="true"
                                className="mt-[9px] h-1.5 overflow-hidden rounded-full bg-muted"
                            >
                                <div
                                    className={cn("h-full", fill)}
                                    style={{
                                        width: `${barPercent(draft[key])}%`,
                                    }}
                                />
                            </div>
                            <FieldMessage
                                id={errorId}
                                message={error}
                                announce={announcedField === key}
                            />
                        </div>
                    );
                })}
                <p
                    aria-live="polite"
                    className={cn(
                        "mt-3 text-sm tabular-nums",
                        total === 100
                            ? "text-muted-foreground"
                            : "text-destructive",
                    )}
                >
                    {formatBudgetTotal(total)}
                </p>
                <FieldMessage message={formError} announce />
            </form>
        </StepFrame>
    );
}

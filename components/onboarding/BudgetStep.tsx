"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

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
    onNextAfterSave,
    leavingAfterSave,
    draft,
    onChange,
}: Props) {
    const {
        pending,
        formError,
        formRef,
        announcedField,
        fieldError,
        edited,
        submit,
    } = useStepSubmit<BudgetRuleInput>(FIELDS);
    const total = budgetDraftTotal(draft);
    const tb = useTranslations("settings.budget");
    const t = useTranslations("onboarding");
    const tc = useTranslations("common.buckets");
    const ts = useTranslations("settings.saveButton");

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        submit(
            () => saveBudgetRule(draft),
            () => onNextAfterSave(),
        );
    }

    return (
        <StepFrame
            headingRef={headingRef}
            title={t("budget.title")}
            description={
                <ResponsiveText
                    desktop={t("budget.descriptionDesktop")}
                    phone={t("budget.descriptionPhone")}
                />
            }
            footer={
                <StepFooter
                    onBack={onBack}
                    onSkip={onNext}
                    skipLabel={
                        <ResponsiveText
                            desktop={t("budget.skipDesktop")}
                            phone={t("footer.skip")}
                        />
                    }
                    primaryLabel={t("footer.continue")}
                    pendingLabel={ts("saving")}
                    pending={pending || leavingAfterSave}
                    formId={FORM_ID}
                />
            }
        >
            <form id={FORM_ID} ref={formRef} onSubmit={handleSubmit} noValidate>
                {BUCKETS.map(({ key, accent, fill }) => {
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
                                        {key === "savings"
                                            ? t("budget.savings")
                                            : tc(key)}
                                    </Label>
                                    <p
                                        className={cn(
                                            "mt-0.5 hidden text-[11px] sm:block",
                                            WIZARD_FAINT_TEXT_CLASS,
                                        )}
                                    >
                                        {t(`budget.helpers.${key}`)}
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
                                        onChange={(e) => {
                                            edited(key);
                                            onChange({
                                                ...draft,
                                                [key]: e.target.value,
                                            });
                                        }}
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
                    {formatBudgetTotal(total, tb)}
                </p>
                <FieldMessage message={formError} announce />
            </form>
        </StepFrame>
    );
}

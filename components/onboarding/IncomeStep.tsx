"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

import { setFixedIncome } from "@/app/_actions/income/set-fixed";
import { Label } from "@/components/ui/label";
import type { FixedIncomeInput } from "@/lib/schemas/income";

import { FieldMessage } from "./FieldMessage";
import { MoneyField } from "./MoneyField";
import {
    isBlankAmount,
    normalizeAmount,
    type StepNav,
} from "./onboarding-model";
import { WIZARD_LABEL_CLASS } from "./onboarding-styles";
import { ResponsiveText } from "./ResponsiveText";
import { StepFooter } from "./StepFooter";
import { StepFrame } from "./StepFrame";
import { useStepSubmit } from "./use-step-submit";

const FORM_ID = "onboarding-income-form";
const FIELDS = ["amount"] as const;

type Props = StepNav & {
    value: string;
    savedIncome: number;
    onChange: (value: string) => void;
    onSaved: (amount: number) => void;
};

export function IncomeStep({
    headingRef,
    onBack,
    onNext,
    onNextAfterSave,
    leavingAfterSave,
    value,
    savedIncome,
    onChange,
    onSaved,
}: Props) {
    const {
        pending,
        formError,
        formRef,
        announcedField,
        fieldError,
        edited,
        submit,
    } = useStepSubmit<FixedIncomeInput>(FIELDS);
    const error = fieldError("amount");
    const t = useTranslations("onboarding");
    const ts = useTranslations("settings.saveButton");

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const amount = normalizeAmount(value);
        if (isBlankAmount(amount) || Number(amount) === savedIncome) {
            onNext();
            return;
        }
        submit(
            () => setFixedIncome({ amount }),
            (data) => {
                onSaved(data.amount);
                onNextAfterSave();
            },
        );
    }

    return (
        <StepFrame
            headingRef={headingRef}
            title={
                <ResponsiveText
                    desktop={t("income.titleDesktop")}
                    phone={t("income.titlePhone")}
                />
            }
            description={
                <ResponsiveText
                    desktop={t("income.descriptionDesktop")}
                    phone={t("income.descriptionPhone")}
                />
            }
            footer={
                <StepFooter
                    onBack={onBack}
                    onSkip={onNext}
                    primaryLabel={t("footer.continue")}
                    pendingLabel={ts("saving")}
                    pending={pending || leavingAfterSave}
                    formId={FORM_ID}
                />
            }
        >
            <form id={FORM_ID} ref={formRef} onSubmit={handleSubmit} noValidate>
                <Label
                    htmlFor="onboarding-income"
                    className={WIZARD_LABEL_CLASS}
                >
                    {t("income.label")}
                </Label>
                <MoneyField
                    id="onboarding-income"
                    name="amount"
                    value={value}
                    onChange={(next) => {
                        edited("amount");
                        onChange(next);
                    }}
                    errorId={error ? "onboarding-income-error" : undefined}
                />
                <FieldMessage
                    id="onboarding-income-error"
                    message={error}
                    announce={announcedField === "amount"}
                />
                <FieldMessage message={formError} announce />
            </form>
        </StepFrame>
    );
}

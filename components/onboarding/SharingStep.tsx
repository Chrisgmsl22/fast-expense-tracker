"use client";

import type { FormEvent } from "react";

import { saveSplitRule } from "@/app/_actions/settings/save-split-rule";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    PARTNER_NAME_MAX_LENGTH,
    type SplitRuleInput,
} from "@/lib/schemas/settings";

import { FieldMessage } from "./FieldMessage";
import {
    sharePercentToSave,
    type ShareChoice,
    type SharingValues,
    type StepNav,
} from "./onboarding-model";
import { WIZARD_FIELD_CLASS, WIZARD_LABEL_CLASS } from "./onboarding-styles";
import { OptionCards, type OptionCard } from "./OptionCards";
import { ResponsiveText } from "./ResponsiveText";
import { ShareSlider } from "./ShareSlider";
import { StepFooter } from "./StepFooter";
import { StepFrame } from "./StepFrame";
import { useStepSubmit } from "./use-step-submit";

const FORM_ID = "onboarding-sharing-form";
const FIELDS = ["partnerName", "sharePercentage"] as const;
const OPTIONS: readonly OptionCard<ShareChoice>[] = [
    { value: "yes", desktop: "Yes, with someone", phone: "Yes" },
    { value: "solo", desktop: "Just me", phone: "Just me" },
];

type Props = StepNav & {
    values: SharingValues;
    onChange: (values: SharingValues) => void;
};

export function SharingStep({
    headingRef,
    onBack,
    onNext,
    onNextAfterSave,
    leavingAfterSave,
    values,
    onChange,
}: Props) {
    const {
        pending,
        formError,
        formRef,
        announcedField,
        fieldError,
        edited,
        clearErrors,
        submit,
    } = useStepSubmit<SplitRuleInput>(FIELDS);
    const { choice, partnerName, percent } = values;
    const nameError = fieldError("partnerName");
    const percentError = fieldError("sharePercentage");

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!choice) return;
        const sharing = choice === "yes";
        // The name and share travel with "Just me" too, so Settings keeps them for later.
        // A name over the limit stays behind, so a hidden field cannot block the save.
        const keepName =
            sharing || partnerName.trim().length <= PARTNER_NAME_MAX_LENGTH;
        submit(
            () =>
                saveSplitRule({
                    sharesExpenses: sharing,
                    ...(keepName && { partnerName }),
                    sharePercentage: sharePercentToSave(values),
                }),
            () => onNextAfterSave(),
        );
    }

    return (
        <StepFrame
            headingRef={headingRef}
            title="Do you share expenses?"
            description={
                <ResponsiveText
                    desktop="If you split costs with a partner, we'll only count your share toward your budget."
                    phone="We'll only count your share toward your budget."
                />
            }
            footer={
                <StepFooter
                    onBack={onBack}
                    onSkip={onNext}
                    primaryLabel="Continue"
                    pendingLabel="Saving…"
                    pending={pending || leavingAfterSave}
                    primaryDisabled={!choice}
                    formId={FORM_ID}
                />
            }
        >
            <form id={FORM_ID} ref={formRef} onSubmit={handleSubmit} noValidate>
                <OptionCards
                    name="sharing"
                    label="Do you share expenses?"
                    options={OPTIONS}
                    value={choice}
                    onChange={(next) => {
                        clearErrors();
                        onChange({ ...values, choice: next });
                    }}
                />
                {choice === "yes" && (
                    <>
                        <Label
                            htmlFor="onboarding-partner"
                            className={WIZARD_LABEL_CLASS}
                        >
                            Partner&apos;s name
                        </Label>
                        <Input
                            id="onboarding-partner"
                            name="partnerName"
                            value={partnerName}
                            maxLength={PARTNER_NAME_MAX_LENGTH}
                            onChange={(e) => {
                                edited("partnerName");
                                onChange({
                                    ...values,
                                    partnerName: e.target.value,
                                });
                            }}
                            aria-invalid={nameError ? true : undefined}
                            aria-describedby={
                                nameError
                                    ? "onboarding-partner-error"
                                    : undefined
                            }
                            className={WIZARD_FIELD_CLASS}
                        />
                        <FieldMessage
                            id="onboarding-partner-error"
                            message={nameError}
                            announce={announcedField === "partnerName"}
                        />
                        <div className="mt-[18px]">
                            <ShareSlider
                                id="onboarding-share"
                                percent={percent}
                                partnerName={partnerName}
                                onChange={(next) => {
                                    edited("sharePercentage");
                                    onChange({
                                        ...values,
                                        percent: next,
                                        sliderMoved: true,
                                    });
                                }}
                                errorId={
                                    percentError
                                        ? "onboarding-share-error"
                                        : undefined
                                }
                            />
                            <FieldMessage
                                id="onboarding-share-error"
                                message={percentError}
                                announce={announcedField === "sharePercentage"}
                            />
                        </div>
                    </>
                )}
                <FieldMessage message={formError} announce />
            </form>
        </StepFrame>
    );
}

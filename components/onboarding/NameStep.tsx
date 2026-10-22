"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

import { updateDisplayName } from "@/app/_actions/account/update-display-name";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withSessionLock } from "@/lib/auth/session-lock";
import type { DisplayNameInput } from "@/lib/schemas/auth";
import { cn } from "@/lib/utils";

import { FieldMessage } from "./FieldMessage";
import type { StepNav } from "./onboarding-model";
import { WIZARD_FIELD_CLASS, WIZARD_LABEL_CLASS } from "./onboarding-styles";
import { ResponsiveText } from "./ResponsiveText";
import { StepFooter } from "./StepFooter";
import { StepFrame } from "./StepFrame";
import { useStepSubmit } from "./use-step-submit";

const FORM_ID = "onboarding-name-form";
const FIELDS = ["name"] as const;

type Props = StepNav & {
    value: string;
    savedName: string;
    onChange: (value: string) => void;
    onSaved: (name: string) => void;
};

export function NameStep({
    headingRef,
    onBack,
    onNext,
    onNextAfterSave,
    leavingAfterSave,
    value,
    savedName,
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
    } = useStepSubmit<DisplayNameInput>(FIELDS);
    const error = fieldError("name");
    const t = useTranslations("onboarding");
    const ts = useTranslations("settings.saveButton");

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (value.trim() === savedName) {
            onNext();
            return;
        }
        // The action rewrites the session cookie, which the idle guard also writes.
        submit(
            () => withSessionLock(() => updateDisplayName({ name: value })),
            (data) => {
                onSaved(data.name);
                onNextAfterSave();
            },
        );
    }

    return (
        <StepFrame
            headingRef={headingRef}
            title={t("name.title")}
            description={
                <ResponsiveText
                    desktop={t("name.descriptionDesktop")}
                    phone={t("name.descriptionPhone")}
                />
            }
            footer={
                <StepFooter
                    onBack={onBack}
                    primaryLabel={t("footer.continue")}
                    pendingLabel={ts("saving")}
                    pending={pending || leavingAfterSave}
                    formId={FORM_ID}
                />
            }
        >
            <form id={FORM_ID} ref={formRef} onSubmit={handleSubmit} noValidate>
                <Label htmlFor="onboarding-name" className={WIZARD_LABEL_CLASS}>
                    {t("name.label")}
                </Label>
                <Input
                    id="onboarding-name"
                    name="name"
                    autoComplete="name"
                    value={value}
                    onChange={(e) => {
                        edited("name");
                        onChange(e.target.value);
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={
                        error ? "onboarding-name-error" : undefined
                    }
                    className={cn(WIZARD_FIELD_CLASS, "h-12 sm:text-base")}
                />
                <FieldMessage
                    id="onboarding-name-error"
                    message={error}
                    announce={announcedField === "name"}
                />
                <FieldMessage message={formError} announce />
            </form>
        </StepFrame>
    );
}

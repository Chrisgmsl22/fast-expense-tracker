"use client";

import type { FormEvent } from "react";

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
                onNext();
            },
        );
    }

    return (
        <StepFrame
            headingRef={headingRef}
            title="What's your name?"
            description={
                <ResponsiveText
                    desktop="We'll use it around the app. You can change it later."
                    phone="We'll use it around the app. Change it later anytime."
                />
            }
            footer={
                <StepFooter
                    onBack={onBack}
                    primaryLabel="Continue"
                    pendingLabel="Saving…"
                    pending={pending}
                    formId={FORM_ID}
                />
            }
        >
            <form id={FORM_ID} ref={formRef} onSubmit={handleSubmit} noValidate>
                <Label htmlFor="onboarding-name" className={WIZARD_LABEL_CLASS}>
                    Your name
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

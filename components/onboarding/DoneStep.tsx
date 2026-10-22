"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { completeOnboarding } from "@/app/_actions/account/complete-onboarding";

import { FieldMessage } from "./FieldMessage";
import type { StepNav } from "./onboarding-model";
import { ResponsiveText } from "./ResponsiveText";
import { StepFooter } from "./StepFooter";
import { StepFrame } from "./StepFrame";
import { useStepSubmit } from "./use-step-submit";

const NO_FIELDS = [] as const;

type Props = Pick<StepNav, "headingRef"> & {
    name: string;
    onFinished: () => void;
    /** The finish saved and the dialog is fading out. */
    closing: boolean;
};

export function DoneStep({ headingRef, name, onFinished, closing }: Props) {
    const t = useTranslations("onboarding.done");
    // The wizard refreshes once its close animation ends, so the dashboard never jumps under it.
    const { pending, formError, submit } = useStepSubmit<Record<string, never>>(
        NO_FIELDS,
        { refreshOnSave: false },
    );

    return (
        <StepFrame
            headingRef={headingRef}
            centered
            lead={
                <div
                    aria-hidden="true"
                    className="mb-5 flex size-[66px] items-center justify-center rounded-full bg-positive-tint"
                >
                    <Check className="size-8 text-positive" strokeWidth={2.5} />
                </div>
            }
            title={t("title", { name })}
            description={
                <ResponsiveText
                    desktop={t("descriptionDesktop")}
                    phone={t("descriptionPhone")}
                />
            }
            footer={
                <StepFooter
                    primaryLabel={t("open")}
                    pendingLabel={t("finishing")}
                    pending={pending || closing}
                    onPrimary={() => submit(completeOnboarding, onFinished)}
                    fullWidth
                />
            }
        >
            <FieldMessage message={formError} announce />
        </StepFrame>
    );
}

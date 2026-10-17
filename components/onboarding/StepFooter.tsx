"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { WIZARD_FAINT_TEXT_CLASS } from "./onboarding-styles";

type Props = {
    onBack?: () => void;
    onSkip?: () => void;
    skipLabel?: ReactNode;
    primaryLabel: string;
    pendingLabel?: string;
    pending?: boolean;
    /** Submits this form; without it the primary button calls `onPrimary`. */
    formId?: string;
    onPrimary?: () => void;
    primaryDisabled?: boolean;
    fullWidth?: boolean;
};

const TEXT_BUTTON_CLASS = "h-10 px-2 text-sm font-semibold";

export function StepFooter({
    onBack,
    onSkip,
    skipLabel = "Skip",
    primaryLabel,
    pendingLabel,
    pending = false,
    formId,
    onPrimary,
    primaryDisabled = false,
    fullWidth = false,
}: Props) {
    return (
        <div className="flex items-center gap-3 border-t border-muted px-[22px] pt-4 pb-[22px]">
            {onBack && (
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onBack}
                    disabled={pending}
                    className={cn(TEXT_BUTTON_CLASS, "text-muted-foreground")}
                >
                    Back
                </Button>
            )}
            {onSkip && (
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onSkip}
                    disabled={pending}
                    className={cn(TEXT_BUTTON_CLASS, WIZARD_FAINT_TEXT_CLASS)}
                >
                    {skipLabel}
                </Button>
            )}
            <Button
                type={formId ? "submit" : "button"}
                form={formId}
                onClick={formId ? undefined : onPrimary}
                disabled={pending || primaryDisabled}
                className={cn(
                    "h-[46px] rounded-xl px-6 text-[15px] font-semibold",
                    fullWidth ? "w-full" : "ml-auto",
                )}
            >
                {pending && pendingLabel ? pendingLabel : primaryLabel}
            </Button>
        </div>
    );
}

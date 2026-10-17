"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
    WIZARD_BUSY_BUTTON_CLASS,
    WIZARD_BUSY_GHOST_BUTTON_CLASS,
    WIZARD_FAINT_TEXT_CLASS,
} from "./onboarding-styles";

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

const TEXT_BUTTON_CLASS = cn(
    "h-10 px-2 text-sm font-semibold",
    WIZARD_BUSY_GHOST_BUTTON_CLASS,
);

/**
 * Busy buttons stay focusable (`aria-disabled`, not `disabled`) so focus never drops to <body>.
 */
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
                    focusableWhenDisabled
                    className={cn(
                        TEXT_BUTTON_CLASS,
                        "text-muted-foreground aria-disabled:hover:text-muted-foreground",
                    )}
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
                    focusableWhenDisabled
                    className={cn(
                        TEXT_BUTTON_CLASS,
                        WIZARD_FAINT_TEXT_CLASS,
                        "aria-disabled:hover:text-muted-foreground/70",
                    )}
                >
                    {skipLabel}
                </Button>
            )}
            <Button
                type={formId ? "submit" : "button"}
                form={formId}
                onClick={formId ? undefined : onPrimary}
                disabled={pending || primaryDisabled}
                focusableWhenDisabled={pending}
                className={cn(
                    "h-[46px] rounded-xl px-6 text-[15px] font-semibold",
                    WIZARD_BUSY_BUTTON_CLASS,
                    fullWidth ? "w-full" : "ml-auto",
                )}
            >
                {pending && pendingLabel ? pendingLabel : primaryLabel}
            </Button>
        </div>
    );
}

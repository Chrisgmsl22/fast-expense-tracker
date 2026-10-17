"use client";

import type { ReactNode, Ref } from "react";

import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
    headingRef: Ref<HTMLHeadingElement>;
    title: ReactNode;
    description?: ReactNode;
    /** The welcome and done screens: centred, with a larger heading. */
    centered?: boolean;
    /** Shown above the heading on a centred step. */
    lead?: ReactNode;
    children?: ReactNode;
    footer: ReactNode;
};

/** One wizard step: its heading names the dialog, and focus lands on it when the step opens. */
export function StepFrame({
    headingRef,
    title,
    description,
    centered = false,
    lead,
    children,
    footer,
}: Props) {
    return (
        <>
            <div
                className={cn(
                    "flex flex-1 flex-col px-[22px] py-6",
                    centered && "items-center justify-center text-center",
                )}
            >
                {lead}
                <DialogTitle
                    ref={headingRef}
                    tabIndex={-1}
                    className={cn(
                        "leading-tight font-bold text-foreground outline-none",
                        centered
                            ? "mb-3 text-[25px] tracking-[-0.5px]"
                            : "mb-1.5 text-[22px] tracking-[-0.3px]",
                    )}
                >
                    {title}
                </DialogTitle>
                {description && (
                    <DialogDescription
                        className={cn(
                            centered
                                ? "max-w-[300px] text-[15px] leading-[1.55]"
                                : "mb-[22px] text-sm leading-normal",
                        )}
                    >
                        {description}
                    </DialogDescription>
                )}
                {children}
            </div>
            {footer}
        </>
    );
}

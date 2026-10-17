"use client";

import { cn } from "@/lib/utils";

import { WIZARD_FAINT_TEXT_CLASS } from "./onboarding-styles";

type Props = {
    id: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
    errorId?: string;
};

/** A large MXN amount field with its "$" and "MXN" marks inside the box. */
export function MoneyField({ id, name, value, onChange, errorId }: Props) {
    return (
        <div
            className={cn(
                "mt-1.5 flex h-14 items-center rounded-xl border border-input bg-muted/40 px-4 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
                errorId && "border-destructive",
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    "mr-1 text-[22px] font-semibold",
                    WIZARD_FAINT_TEXT_CLASS,
                )}
            >
                $
            </span>
            <input
                id={id}
                name={name}
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-invalid={errorId ? true : undefined}
                aria-describedby={errorId}
                className="min-w-0 flex-1 bg-transparent text-[22px] font-semibold text-foreground outline-none"
            />
            <span
                aria-hidden="true"
                className={cn(
                    "text-[13px] font-semibold",
                    WIZARD_FAINT_TEXT_CLASS,
                )}
            >
                MXN
            </span>
        </div>
    );
}

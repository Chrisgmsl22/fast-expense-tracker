"use client";

import { cn } from "@/lib/utils";

import { ResponsiveText } from "./ResponsiveText";

export type OptionCard<T extends string> = {
    value: T;
    desktop: string;
    phone: string;
};

type Props<T extends string> = {
    name: string;
    label: string;
    options: readonly OptionCard<T>[];
    value: T | null;
    onChange: (value: T) => void;
};

/** A radio group drawn as side-by-side cards; native radios keep arrow-key moves. */
export function OptionCards<T extends string>({
    name,
    label,
    options,
    value,
    onChange,
}: Props<T>) {
    return (
        <div
            role="radiogroup"
            aria-label={label}
            className="mb-[18px] flex gap-2 sm:gap-2.5"
        >
            {options.map((option) => (
                <label
                    key={option.value}
                    className={cn(
                        "flex-1 cursor-pointer rounded-xl border-2 p-3 text-center text-[13px] font-semibold text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 sm:p-[13px] sm:text-sm",
                        value === option.value
                            ? "border-primary bg-muted/60"
                            : "border-border bg-background",
                    )}
                >
                    <input
                        type="radio"
                        name={name}
                        value={option.value}
                        checked={value === option.value}
                        onChange={() => onChange(option.value)}
                        className="sr-only"
                    />
                    <ResponsiveText
                        desktop={option.desktop}
                        phone={option.phone}
                    />
                </label>
            ))}
        </div>
    );
}

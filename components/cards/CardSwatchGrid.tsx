"use client";

import { CARD_PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Props = {
    /** The selected colour, already trimmed and lowercased. */
    selected: string;
    onColor: (hex: string) => void;
    className?: string;
};

/** One toggle button per named card colour in the shared palette. */
export function CardSwatchGrid({ selected, onColor, className }: Props) {
    return (
        <div
            role="group"
            aria-label="Colour swatches"
            className={cn("flex flex-wrap gap-2", className)}
        >
            {CARD_PALETTE.map((swatch) => (
                <button
                    key={swatch.hex}
                    type="button"
                    aria-label={swatch.name}
                    aria-pressed={selected === swatch.hex}
                    onClick={() => onColor(swatch.hex)}
                    style={{ backgroundColor: swatch.hex }}
                    className={cn(
                        "size-7 rounded-md border border-black/10 transition",
                        selected === swatch.hex &&
                            "ring-2 ring-ring ring-offset-2 ring-offset-background",
                    )}
                />
            ))}
        </div>
    );
}

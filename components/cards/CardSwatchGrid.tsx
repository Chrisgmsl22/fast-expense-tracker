"use client";

import { CARD_PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Props = {
    /** The selected colour, already trimmed and lowercased. */
    selected: string;
    onColor: (hex: string) => void;
    /**
     * `wrap` flows the swatches inline. `grid` sets them in even rows of five,
     * each dot inside a 36px hit area.
     */
    layout?: "wrap" | "grid";
    className?: string;
};

/** One toggle button per named card colour in the shared palette. */
export function CardSwatchGrid({
    selected,
    onColor,
    layout = "wrap",
    className,
}: Props) {
    const grid = layout === "grid";
    return (
        <div
            role="group"
            aria-label="Colour swatches"
            className={cn(
                grid
                    ? "grid grid-cols-5 justify-items-center gap-1"
                    : "flex flex-wrap gap-2",
                className,
            )}
        >
            {CARD_PALETTE.map((swatch) => {
                const pressed = selected === swatch.hex;
                return (
                    <button
                        key={swatch.hex}
                        type="button"
                        aria-label={swatch.name}
                        aria-pressed={pressed}
                        onClick={() => onColor(swatch.hex)}
                        className={cn(
                            "rounded-md",
                            grid && "grid size-9 place-items-center",
                        )}
                    >
                        <span
                            aria-hidden="true"
                            style={{ backgroundColor: swatch.hex }}
                            className={cn(
                                "block size-7 rounded-md border border-black/10 transition",
                                pressed &&
                                    "ring-2 ring-ring ring-offset-2 ring-offset-background",
                            )}
                        />
                    </button>
                );
            })}
        </div>
    );
}

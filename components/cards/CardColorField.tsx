"use client";

import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isPaletteColor, isValidHex } from "@/lib/palette";

import { DEFAULT_CARD_COLOR } from "./card-type-options";
import { CardSwatchGrid } from "./CardSwatchGrid";

/**
 * Swatch grid over the shared palette, with the custom `#RRGGBB` field behind an
 * opt-in "advanced" checkbox. The checkbox starts checked when the initial colour
 * isn't a palette swatch (editing a card that already has a custom hex), so the
 * user sees their value; otherwise the hex input stays hidden.
 */
export function CardColorField({
    color,
    onColor,
    idPrefix,
}: {
    color: string;
    onColor: (value: string) => void;
    idPrefix: string;
}) {
    const normalized = color.trim().toLowerCase();
    const previewValid = isValidHex(normalized);
    const [showCustom, setShowCustom] = useState(() => !isPaletteColor(color));
    return (
        <div>
            <span className="text-sm font-medium">Colour</span>
            <CardSwatchGrid
                selected={normalized}
                onColor={onColor}
                className="mt-1.5"
            />

            <div className="mt-3 flex items-center gap-2">
                <Checkbox
                    id={`${idPrefix}-custom-toggle`}
                    checked={showCustom}
                    onCheckedChange={(checked) => {
                        const on = checked === true;
                        setShowCustom(on);
                        // Unchecking hides the hex field, so snap back to a swatch;
                        // a hidden custom hex would otherwise still be submitted.
                        if (!on) onColor(DEFAULT_CARD_COLOR);
                    }}
                />
                <Label
                    htmlFor={`${idPrefix}-custom-toggle`}
                    className="text-sm"
                >
                    Enter a custom color (HEX)
                </Label>
            </div>

            {showCustom && (
                <div className="mt-2 flex items-center gap-2">
                    <span
                        aria-hidden
                        className="size-6 shrink-0 rounded-md border"
                        style={{
                            backgroundColor: previewValid
                                ? normalized
                                : "transparent",
                        }}
                    />
                    <Input
                        id={`${idPrefix}-color`}
                        aria-label="HEX color"
                        value={color}
                        onChange={(e) => onColor(e.target.value)}
                        placeholder="#RRGGBB"
                        className="w-32 font-mono"
                    />
                </div>
            )}
        </div>
    );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

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
    error,
}: {
    color: string;
    onColor: (value: string) => void;
    idPrefix: string;
    error?: string;
}) {
    const t = useTranslations("settings.cards");
    const normalized = color.trim().toLowerCase();
    const previewValid = isValidHex(normalized);
    const [showCustom, setShowCustom] = useState(() => !isPaletteColor(color));
    const errorId = `${idPrefix}-color-error`;
    const describedBy = error ? errorId : undefined;
    return (
        <div>
            <span className="text-sm font-medium">{t("color")}</span>
            <CardSwatchGrid
                selected={normalized}
                onColor={onColor}
                describedBy={describedBy}
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
                    {t("customToggle")}
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
                        aria-label={t("hexAria")}
                        value={color}
                        onChange={(e) => onColor(e.target.value)}
                        placeholder={t("hexPlaceholder")}
                        aria-invalid={Boolean(error)}
                        aria-describedby={describedBy}
                        className="w-32 font-mono"
                    />
                </div>
            )}
            {error && (
                <p
                    id={errorId}
                    role="alert"
                    className="mt-1 text-sm text-destructive"
                >
                    {error}
                </p>
            )}
        </div>
    );
}

"use client";

import { cn } from "@/lib/utils";

import { partnerLabel } from "./onboarding-model";
import {
    WIZARD_FAINT_TEXT_CLASS,
    WIZARD_LABEL_CLASS,
} from "./onboarding-styles";
import { ResponsiveText } from "./ResponsiveText";

type Props = {
    id: string;
    percent: number;
    partnerName: string;
    onChange: (percent: number) => void;
    errorId?: string;
};

const THUMB_CLASS =
    "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background " +
    "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background";

// The focus ring sits on the thumb, so the track stays a flat bar.
const THUMB_FOCUS_CLASS =
    "focus-visible:[&::-webkit-slider-thumb]:ring-3 focus-visible:[&::-webkit-slider-thumb]:ring-ring/50 " +
    "focus-visible:[&::-moz-range-thumb]:ring-3 focus-visible:[&::-moz-range-thumb]:ring-ring/50";

/** Your share of a shared expense, 1-100%, with the partner's remainder beside it. */
export function ShareSlider({
    id,
    percent,
    partnerName,
    onChange,
    errorId,
}: Props) {
    const partner = partnerLabel(partnerName);
    const partnerPercent = 100 - percent;
    return (
        <div>
            <label
                htmlFor={id}
                className={cn(WIZARD_LABEL_CLASS, "mb-2.5 block")}
            >
                <ResponsiveText
                    desktop="Your share of shared expenses"
                    phone="Your share"
                />{" "}
                — <b className="text-foreground">{percent}%</b>
            </label>
            <input
                id={id}
                type="range"
                name="sharePercentage"
                min={1}
                max={100}
                step={1}
                value={percent}
                onChange={(e) => onChange(Number(e.target.value))}
                aria-valuetext={`You ${percent}%, ${partner} ${partnerPercent}%`}
                aria-invalid={errorId ? true : undefined}
                aria-describedby={errorId}
                style={{
                    background: `linear-gradient(to right, var(--primary) ${percent}%, var(--muted) ${percent}%)`,
                }}
                className={cn(
                    "h-1.5 w-full cursor-pointer appearance-none rounded-full border-0 outline-none",
                    THUMB_CLASS,
                    THUMB_FOCUS_CLASS,
                )}
            />
            <div
                aria-hidden="true"
                className={cn(
                    "mt-2 flex justify-between text-[11px]",
                    WIZARD_FAINT_TEXT_CLASS,
                )}
            >
                <span>You {percent}%</span>
                <span>
                    {partner} {partnerPercent}%
                </span>
            </div>
        </div>
    );
}

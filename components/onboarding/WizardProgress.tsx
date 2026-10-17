import { cn } from "@/lib/utils";

import { STEP_COUNT } from "./onboarding-model";
import { WIZARD_FAINT_TEXT_CLASS } from "./onboarding-styles";

const SEGMENTS = Array.from({ length: STEP_COUNT }, (_, i) => i + 1);

export function WizardProgress({ step }: { step: number }) {
    const label = `Step ${step} of ${STEP_COUNT}`;
    return (
        <div className="flex items-center gap-3 px-[22px] pt-[18px]">
            <div
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={1}
                aria-valuemax={STEP_COUNT}
                aria-valuenow={step}
                aria-valuetext={label}
                className="flex flex-1 gap-[5px]"
            >
                {SEGMENTS.map((segment) => (
                    <span
                        key={segment}
                        className={cn(
                            "h-1 flex-1 rounded-full",
                            segment <= step ? "bg-primary" : "bg-border",
                        )}
                    />
                ))}
            </div>
            <p
                aria-live="polite"
                className={cn(
                    "text-[11px] font-semibold whitespace-nowrap",
                    WIZARD_FAINT_TEXT_CLASS,
                )}
            >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden" aria-hidden="true">
                    {step} / {STEP_COUNT}
                </span>
                <span className="sr-only sm:hidden">{label}</span>
            </p>
        </div>
    );
}

import type { OnboardingCategory } from "@/lib/onboarding/load-onboarding";
import { cn } from "@/lib/utils";

import { PHONE_CHIP_LIMIT } from "./onboarding-model";

const CHIP_CLASS =
    "inline-flex items-center gap-1.5 rounded-full border px-[11px] py-1.5 text-xs text-foreground";

/** Every category from `sm` up; on a phone the first few, then "+N more". */
export function CategoryChips({
    categories,
}: {
    categories: readonly OnboardingCategory[];
}) {
    const folded = Math.max(0, categories.length - PHONE_CHIP_LIMIT);
    return (
        <ul
            aria-label="Your categories"
            className="flex flex-wrap gap-[7px] sm:gap-2"
        >
            {categories.map((category, index) => (
                <li
                    key={category.id}
                    className={cn(
                        CHIP_CLASS,
                        index >= PHONE_CHIP_LIMIT && "hidden sm:inline-flex",
                    )}
                >
                    <span
                        aria-hidden="true"
                        className="size-[9px] rounded-[3px]"
                        style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                </li>
            ))}
            {folded > 0 && (
                <li className={cn(CHIP_CLASS, "sm:hidden")}>+{folded} more</li>
            )}
        </ul>
    );
}

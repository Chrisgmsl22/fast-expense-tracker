import type { OnboardingCategory } from "@/lib/onboarding/load-onboarding";
import { cn } from "@/lib/utils";

import { CategoryChips } from "./CategoryChips";
import type { StepNav } from "./onboarding-model";
import { WIZARD_PANEL_CLASS } from "./onboarding-styles";
import { ResponsiveText } from "./ResponsiveText";
import { StepFooter } from "./StepFooter";
import { StepFrame } from "./StepFrame";

type Props = StepNav & { categories: readonly OnboardingCategory[] };

export function CategoriesStep({
    headingRef,
    onBack,
    onNext,
    categories,
}: Props) {
    const count = categories.length;
    const counted = `${count} ${count === 1 ? "category" : "categories"}`;
    return (
        <StepFrame
            headingRef={headingRef}
            title={
                <ResponsiveText
                    desktop="Your categories are ready"
                    phone="Categories are ready"
                />
            }
            description={
                <ResponsiveText
                    desktop={`${counted} with sensible subcategories. Set a monthly limit from any category's page.`}
                    phone={`${counted} set up for you.`}
                />
            }
            footer={
                <StepFooter
                    onBack={onBack}
                    onSkip={onNext}
                    primaryLabel="Continue"
                    onPrimary={onNext}
                />
            }
        >
            <CategoryChips categories={categories} />
            <p
                className={cn(
                    WIZARD_PANEL_CLASS,
                    "mt-[18px] px-3.5 py-3 text-xs leading-snug text-muted-foreground",
                )}
            >
                <ResponsiveText
                    desktop="More category settings are coming to Settings."
                    phone="More category settings coming soon."
                />
            </p>
        </StepFrame>
    );
}

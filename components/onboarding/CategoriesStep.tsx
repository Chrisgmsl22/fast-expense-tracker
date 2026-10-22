import { useTranslations } from "next-intl";

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
    const t = useTranslations("onboarding");
    const count = categories.length;
    return (
        <StepFrame
            headingRef={headingRef}
            title={
                <ResponsiveText
                    desktop={t("categories.titleDesktop")}
                    phone={t("categories.titlePhone")}
                />
            }
            description={
                <ResponsiveText
                    desktop={t("categories.descriptionDesktop", { count })}
                    phone={t("categories.descriptionPhone", { count })}
                />
            }
            footer={
                <StepFooter
                    onBack={onBack}
                    onSkip={onNext}
                    primaryLabel={t("footer.continue")}
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
                    desktop={t("categories.noteDesktop")}
                    phone={t("categories.notePhone")}
                />
            </p>
        </StepFrame>
    );
}

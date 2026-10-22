import { useTranslations } from "next-intl";

import { CardDots } from "@/components/auth/CardDots";

import type { StepNav } from "./onboarding-model";
import { ResponsiveText } from "./ResponsiveText";
import { StepFooter } from "./StepFooter";
import { StepFrame } from "./StepFrame";

export function WelcomeStep({ headingRef, onNext }: Omit<StepNav, "onBack">) {
    const t = useTranslations("onboarding.welcome");
    return (
        <StepFrame
            headingRef={headingRef}
            centered
            lead={
                <CardDots
                    className="mb-[22px] gap-1.5"
                    dotClassName="size-[11px]"
                />
            }
            title={t("title")}
            description={
                <ResponsiveText
                    desktop={t("descriptionDesktop")}
                    phone={t("descriptionPhone")}
                />
            }
            footer={
                <StepFooter
                    primaryLabel={t("start")}
                    onPrimary={onNext}
                    fullWidth
                />
            }
        />
    );
}

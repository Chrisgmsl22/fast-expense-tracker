import { CardDots } from "@/components/auth/CardDots";

import type { StepNav } from "./onboarding-model";
import { ResponsiveText } from "./ResponsiveText";
import { StepFooter } from "./StepFooter";
import { StepFrame } from "./StepFrame";

const LEAD =
    "A private tracker for you and your partner. Log spending in seconds, always see your real share, and stay on your";

export function WelcomeStep({ headingRef, onNext }: Omit<StepNav, "onBack">) {
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
            title="Welcome to Fast Expense"
            description={
                <ResponsiveText
                    desktop={`${LEAD} 50/25/25 plan. Let's set it up — takes a minute.`}
                    phone={`${LEAD} plan.`}
                />
            }
            footer={
                <StepFooter
                    primaryLabel="Get started"
                    onPrimary={onNext}
                    fullWidth
                />
            }
        />
    );
}

import { useTranslations } from "next-intl";

import type { OnboardingCard } from "@/lib/onboarding/load-onboarding";

import { ResponsiveText } from "./ResponsiveText";

/** Cards already on the account, each marked as added. */
export function AddedCardList({ cards }: { cards: readonly OnboardingCard[] }) {
    const t = useTranslations("onboarding.cards");
    if (cards.length === 0) return null;
    return (
        <ul aria-label={t("addedAria")} className="mb-3.5 space-y-[9px]">
            {cards.map((card) => (
                <li
                    key={card.name}
                    className="flex items-center gap-[11px] rounded-xl border border-positive bg-positive-tint px-[13px] py-[11px]"
                >
                    <span
                        aria-hidden="true"
                        className="size-[18px] shrink-0 rounded-[5px]"
                        style={{ backgroundColor: card.color }}
                    />
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {card.name}
                    </span>
                    <span className="ml-auto text-xs font-semibold text-positive">
                        <ResponsiveText desktop={t("added")} phone="✓" />
                    </span>
                </li>
            ))}
        </ul>
    );
}

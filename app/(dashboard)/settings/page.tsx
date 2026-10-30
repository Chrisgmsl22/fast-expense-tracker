import { getTranslations } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import { getCurrentMonthCdmx } from "@/lib/dates";
import { resolveBudgetRule } from "@/lib/domain/budget-rule";
import {
    budgetRuleRepository,
    cardRepository,
    settingsRepository,
} from "@/lib/repositories";
import { BudgetRuleForm } from "@/components/settings/BudgetRuleForm";
import { CardsForm } from "@/components/settings/CardsForm";
import { LanguageSection } from "@/components/settings/LanguageSection";
import { SplitRuleForm } from "@/components/settings/SplitRuleForm";

// Per-request, DB-backed data — never prerender at build (no DB in preview builds, ADR-0004).
export const dynamic = "force-dynamic";

/** Sections designed in the mockup but deferred past CHORE-6.a (spec 0006 §8). */
const COMING_SOON = [
    "categoryLimits",
    "preferences",
    "privacy",
    "exportData",
    "account",
] as const;

export default async function SettingsPage() {
    const userId = await getSessionUserId();
    // The proxy route gate guarantees a session; this satisfies the nullable
    // type and fails safe if it's ever reached without one.
    if (!userId) {
        return null;
    }

    const currentMonth = getCurrentMonthCdmx();
    const t = await getTranslations("settings");
    const [settings, cards, budgetRules] = await Promise.all([
        settingsRepository.getSettings(userId),
        cardRepository.listForSettings(userId),
        budgetRuleRepository.listRules(userId),
    ]);

    return (
        <main className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
            <h1 className="text-2xl font-semibold">{t("title")}</h1>

            <div className="mt-6 space-y-4">
                <SplitRuleForm
                    sharesExpenses={settings.sharesExpenses}
                    partnerName={settings.partnerName}
                    defaultSharePercentage={settings.defaultSharePercentage}
                />

                <BudgetRuleForm
                    rule={resolveBudgetRule(budgetRules, currentMonth)}
                    month={currentMonth}
                />

                <CardsForm cards={cards} />

                <LanguageSection />

                {/* Deferred sections (spec 0006 §8) — placeholders so the page
                    reads as the full Settings surface without shipping them yet. */}
                <section
                    aria-label={t("comingSoon.ariaLabel")}
                    className="rounded-xl border border-dashed p-5"
                >
                    <p className="font-semibold">{t("comingSoon.title")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t("comingSoon.description")}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                        {COMING_SOON.map((item) => (
                            <li
                                key={item}
                                className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground"
                            >
                                {t(`comingSoon.items.${item}`)}{" "}
                                <span className="text-xs">
                                    {t("comingSoon.badge")}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </main>
    );
}

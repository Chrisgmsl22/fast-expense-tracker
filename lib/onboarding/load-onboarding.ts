import { resolveBudgetRule, type BudgetRule } from "@/lib/domain/budget-rule";
import type { BudgetRuleRepository } from "@/lib/repositories/budget-rule.repository";
import type { CardRepository } from "@/lib/repositories/card.repository";
import type { CategoryRepository } from "@/lib/repositories/category.repository";
import type { IncomeRepository } from "@/lib/repositories/income.repository";
import type { SettingsRepository } from "@/lib/repositories/settings.repository";
import type { UserRepository } from "@/lib/repositories/user.repository";
import { safeErrorSummary } from "@/lib/safe-error";

export type OnboardingCard = { name: string; color: string };

export type OnboardingCategory = { id: string; name: string; color: string };

/** What the wizard prefills from, so a reload resumes with the values already saved. */
export type OnboardingData = {
    name: string;
    sharing: {
        sharesExpenses: boolean;
        partnerName: string;
        /** Whole percent, 1-100. */
        sharePercent: number;
    };
    /** The fixed income in force this month; 0 when none is set. */
    fixedIncome: number;
    budgetRule: BudgetRule;
    /** Active cards the user added. Cash is left out: it is always there. */
    cards: OnboardingCard[];
    categories: OnboardingCategory[];
};

export type OnboardingSources = {
    users: Pick<UserRepository, "getOnboardingState">;
    settings: Pick<SettingsRepository, "getSettings">;
    income: Pick<IncomeRepository, "getMonthlySummary">;
    budgetRules: Pick<BudgetRuleRepository, "listRules">;
    cards: Pick<CardRepository, "listForSettings">;
    categories: Pick<CategoryRepository, "listForPicker">;
};

/**
 * The wizard's data when `userId` has not finished onboarding, else null. A
 * failed read also gives null: the wizard waits for the next visit rather than
 * blocking the app.
 */
export async function loadOnboarding(
    userId: string,
    month: string,
    sources: OnboardingSources,
): Promise<OnboardingData | null> {
    try {
        const state = await sources.users.getOnboardingState(userId);
        if (!state || state.onboardedAt !== null) return null;

        const [settings, income, rules, cards, categories] = await Promise.all([
            sources.settings.getSettings(userId),
            sources.income.getMonthlySummary(userId, month),
            sources.budgetRules.listRules(userId),
            sources.cards.listForSettings(userId),
            sources.categories.listForPicker(userId),
        ]);

        return {
            name: state.name,
            sharing: {
                sharesExpenses: settings.sharesExpenses,
                partnerName: settings.partnerName ?? "",
                sharePercent: Math.round(settings.defaultSharePercentage * 100),
            },
            fixedIncome: income.fixed,
            budgetRule: resolveBudgetRule(rules, month),
            cards: cards
                .filter((c) => c.archivedAt === null && c.type !== "cash")
                .map(({ name, color }) => ({ name, color })),
            categories: categories.map(({ id, name, color }) => ({
                id,
                name,
                color,
            })),
        };
    } catch (error) {
        console.error("loadOnboarding: read failed", safeErrorSummary(error));
        return null;
    }
}

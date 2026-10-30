import type { ReactNode } from "react";
import { getSessionContext } from "@/lib/auth/session";
import {
    budgetRuleRepository,
    cardRepository,
    categoryRepository,
    incomeRepository,
    settingsRepository,
    userRepository,
} from "@/lib/repositories";
import { loadOnboarding } from "@/lib/onboarding/load-onboarding";
import { resolvePartnerName } from "@/lib/domain/settings";
import { getCurrentMonthCdmx } from "@/lib/dates";
import { getDashboardSummary } from "@/lib/services/dashboard/dashboard.service";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { IdleSessionGuard } from "@/components/auth/IdleSessionGuard";
import { AppNav } from "@/components/nav/AppNav";
import { SidebarDateGuard } from "@/components/nav/SidebarDateGuard";
import { buildSidebarModel } from "@/components/nav/sidebar-model";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default async function DashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await getSessionContext();
    if (!session) return null;
    const { userId } = session;
    // One clock controls both the current-month query and its calendar progress.
    const now = new Date();
    const month = getCurrentMonthCdmx(now);
    const [settings, settlement, summary, onboarding] = await Promise.all([
        settingsRepository.getSettings(userId),
        getSettlement(userId),
        getDashboardSummary(userId, month, { now }),
        loadOnboarding(userId, month, {
            users: userRepository,
            settings: settingsRepository,
            income: incomeRepository,
            budgetRules: budgetRuleRepository,
            cards: cardRepository,
            categories: categoryRepository,
        }),
    ]);
    const model = buildSidebarModel(
        summary,
        settlement.balance,
        settings.sharesExpenses,
        resolvePartnerName(settings.partnerName),
        now,
    );
    return (
        <IdleSessionGuard
            key={session.idleSessionId}
            idleExpiresAt={session.idleExpiresAt}
            idleSessionId={session.idleSessionId}
        >
            <SidebarDateGuard dayKey={model.period.dayKey} />
            <div className="min-h-screen lg:pl-[252px]">
                <AppNav
                    email={session.email ?? undefined}
                    name={session.name ?? undefined}
                    model={model}
                />
                <div className="min-w-0">{children}</div>
            </div>
            {onboarding && <OnboardingWizard data={onboarding} />}
        </IdleSessionGuard>
    );
}

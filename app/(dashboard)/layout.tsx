import type { ReactNode } from "react";
import { auth } from "@/auth";
import { settingsRepository } from "@/lib/repositories";
import { resolvePartnerName } from "@/lib/domain/settings";
import { getCurrentMonthCdmx } from "@/lib/dates";
import { getDashboardSummary } from "@/lib/services/dashboard/dashboard.service";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { IdleSessionGuard } from "@/components/auth/IdleSessionGuard";
import { AppNav } from "@/components/nav/AppNav";
import { SidebarDateGuard } from "@/components/nav/SidebarDateGuard";
import { buildSidebarModel } from "@/components/nav/sidebar-model";

export default async function DashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return null;
    // One clock controls both the current-month query and its calendar progress.
    const now = new Date();
    const [settings, settlement, summary] = await Promise.all([
        settingsRepository.getSettings(userId),
        getSettlement(userId),
        getDashboardSummary(userId, getCurrentMonthCdmx(now), { now }),
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
                    email={session.user?.email ?? undefined}
                    name={session.user?.name ?? undefined}
                    model={model}
                />
                <div className="min-w-0">{children}</div>
            </div>
        </IdleSessionGuard>
    );
}

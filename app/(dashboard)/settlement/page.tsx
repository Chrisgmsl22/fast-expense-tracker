import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getCurrentMonthCdmx } from "@/lib/dates";
import { getScopedMonth } from "@/lib/month-scope.server";
import { isBalanceSettled } from "@/lib/domain/settlement";
import { resolvePartnerName } from "@/lib/domain/settings";
import { settingsRepository } from "@/lib/repositories";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { MonthPicker } from "@/components/expense/MonthPicker";
import { SettlementActions } from "@/components/settlement/SettlementActions";
import { SettlementBalanceCard } from "@/components/settlement/SettlementBalanceCard";
import { SettlementBreakdown } from "@/components/settlement/SettlementBreakdown";
import { SettlementCloseCard } from "@/components/settlement/SettlementCloseCard";
import { SettlementHelp } from "@/components/settlement/SettlementHelp";
import { SettlementJournalKey } from "@/components/settlement/SettlementJournalKey";
import { SettlementViews } from "@/components/settlement/SettlementViews";

// Per-request, DB-backed — never prerender at build (no DB in preview builds).
export const dynamic = "force-dynamic";

export default async function SettlementPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    // URL parameter → remembered month → current month (`lib/month-scope.ts`),
    // so a link stays linkable and the choice survives leaving the screen. It
    // scopes the Month and History views only — the balance is the open cycle,
    // which belongs to no month.
    const { month: monthParam } = await searchParams;
    const month = await getScopedMonth(monthParam);
    const currentMonth = getCurrentMonthCdmx();

    const session = await auth();
    const userId = session?.user?.id;
    // The proxy route gate guarantees a session; this satisfies the nullable
    // type and fails safe if it's ever reached without one.
    if (!userId) {
        return null;
    }

    const [settlement, settings] = await Promise.all([
        getSettlement(userId, {}, { month }),
        settingsRepository.getSettings(userId),
    ]);
    // A Solo user only reaches settlement while a balance is still open, so they
    // can wind it down. Once solo + settled, the surface is dead —
    // send them back to the dashboard (the nav link is already hidden then too).
    // Shared users always pass. Reuse the balance already computed above.
    if (!settings.sharesExpenses && isBalanceSettled(settlement.balance)) {
        redirect("/dashboard");
    }
    const partnerName = resolvePartnerName(settings.partnerName);
    // The offer to close only stands when the settlement is square AND there is
    // a transfer in the open cycle to carry the marker (spec 0007 §3.5).
    const canClose =
        isBalanceSettled(settlement.balance) &&
        settlement.closableMovementId !== null;
    // "2026-09" → "September 2026". The year is carried because this screen can
    // now sit on any month, so a bare month name would be ambiguous. UTC: the
    // value is a calendar month, not a timestamp to shift.
    const monthLabel = new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${settlement.month.label}-01T12:00:00Z`));

    return (
        <main className="p-4 sm:p-6 lg:p-8">
            <header className="flex items-baseline justify-between">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-bold">Settlement</h1>
                    <SettlementHelp partnerName={partnerName} />
                </div>
                <p className="text-sm text-muted-foreground">
                    with {partnerName}
                </p>
            </header>

            <div className="mt-4">
                <MonthPicker
                    month={month}
                    remember
                    currentMonth={currentMonth}
                />
            </div>

            {/* Two columns on desktop so it fits one screen (mirrors the
                dashboard): balance + actions + breakdown on the left, the
                movement journal on the right. Stacks on mobile. */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
                <div className="space-y-4">
                    <SettlementBalanceCard
                        balance={settlement.balance}
                        carriedOver={settlement.carriedOver}
                        partnerName={partnerName}
                    />
                    {canClose && (
                        <SettlementCloseCard partnerName={partnerName} />
                    )}
                    {/* Logging while browsing the past: the entry is dated today
                        and joins the OPEN settlement, not the month on screen.
                        Say so next to the buttons rather than back-dating the
                        form — see the hand-back note. */}
                    {!settlement.month.isCurrent && (
                        <p className="text-sm text-muted-foreground">
                            You are viewing {monthLabel}. Anything you log is
                            dated today and joins the open settlement.
                        </p>
                    )}
                    <SettlementActions
                        direction={settlement.balance.direction}
                        netAmount={settlement.balance.amount}
                        partnerName={partnerName}
                    />
                    <SettlementBreakdown
                        balance={settlement.balance}
                        breakdownItems={settlement.breakdownItems}
                        partnerName={partnerName}
                    />
                    <SettlementJournalKey partnerName={partnerName} />
                </div>
                <SettlementViews
                    openJournal={settlement.journal}
                    monthJournal={settlement.month.journal}
                    monthLabel={monthLabel}
                    isCurrentMonth={settlement.month.isCurrent}
                    history={settlement.history}
                    partnerName={partnerName}
                />
            </div>
        </main>
    );
}

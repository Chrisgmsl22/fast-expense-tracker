import { auth } from "@/auth";
import { PARTNER_NAME } from "@/lib/partner";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { SettlementActions } from "@/components/settlement/SettlementActions";
import { SettlementBalanceCard } from "@/components/settlement/SettlementBalanceCard";
import { SettlementBreakdown } from "@/components/settlement/SettlementBreakdown";
import { SettlementHelp } from "@/components/settlement/SettlementHelp";
import { SettlementJournal } from "@/components/settlement/SettlementJournal";
import { SettlementJournalKey } from "@/components/settlement/SettlementJournalKey";

// Per-request, DB-backed — never prerender at build (no DB in preview builds).
export const dynamic = "force-dynamic";

export default async function SettlementPage() {
    const session = await auth();
    const userId = session?.user?.id;
    // The proxy route gate guarantees a session; this satisfies the nullable
    // type and fails safe if it's ever reached without one.
    if (!userId) {
        return null;
    }

    const settlement = await getSettlement(userId);

    return (
        <main className="p-4 sm:p-6 lg:p-8">
            <header className="flex items-baseline justify-between">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-bold">Settlement</h1>
                    <SettlementHelp />
                </div>
                <p className="text-sm text-muted-foreground">
                    with {PARTNER_NAME}
                </p>
            </header>

            {/* Two columns on desktop so it fits one screen (mirrors the
                dashboard): balance + actions + breakdown on the left, the
                movement journal on the right. Stacks on mobile. */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
                <div className="space-y-4">
                    <SettlementBalanceCard
                        balance={settlement.balance}
                        carriedOver={settlement.carriedOver}
                    />
                    <SettlementActions
                        direction={settlement.balance.direction}
                        netAmount={settlement.balance.amount}
                    />
                    <SettlementBreakdown balance={settlement.balance} />
                    <SettlementJournalKey />
                </div>
                <SettlementJournal journal={settlement.journal} />
            </div>
        </main>
    );
}

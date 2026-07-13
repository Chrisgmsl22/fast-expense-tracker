import { auth } from "@/auth";
import { PARTNER_NAME } from "@/lib/partner";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { SettlementActions } from "@/components/settlement/SettlementActions";
import { SettlementBalanceCard } from "@/components/settlement/SettlementBalanceCard";
import { SettlementBreakdown } from "@/components/settlement/SettlementBreakdown";
import { SettlementHelp } from "@/components/settlement/SettlementHelp";
import { SettlementJournal } from "@/components/settlement/SettlementJournal";

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
        <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
            <header className="flex items-baseline justify-between">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-bold">Settlement</h1>
                    <SettlementHelp />
                </div>
                <p className="text-sm text-muted-foreground">
                    with {PARTNER_NAME}
                </p>
            </header>

            <div className="mt-6 space-y-4">
                <SettlementBalanceCard
                    balance={settlement.balance}
                    carriedOver={settlement.carriedOver}
                />
                <SettlementActions
                    direction={settlement.balance.direction}
                    netAmount={settlement.balance.amount}
                />
                <SettlementBreakdown balance={settlement.balance} />
                <SettlementJournal journal={settlement.journal} />
            </div>
        </main>
    );
}

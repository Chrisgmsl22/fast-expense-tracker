import { auth } from "@/auth";
import { db } from "@/lib/db";
import { SAVINGS_SLUG } from "@/lib/domain/dashboard";
import { PARTNER_NAME } from "@/lib/partner";
import { getSettlement } from "@/lib/services/settlement/settlement.service";
import { SettlementActions } from "@/components/settlement/SettlementActions";
import { SettlementBalanceCard } from "@/components/settlement/SettlementBalanceCard";
import { SettlementBreakdown } from "@/components/settlement/SettlementBreakdown";
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

    const [settlement, categories] = await Promise.all([
        getSettlement(userId),
        db.category.findMany({
            orderBy: { name: "asc" },
            select: {
                id: true,
                slug: true,
                name: true,
                color: true,
                isRelevant: true,
            },
        }),
    ]);

    // Default the debt form to an essentials category (relevant, not Savings) —
    // most of what the partner fronts is essentials (design note, spec 0004).
    const defaultCategory = categories.find(
        (c) => c.isRelevant && c.slug !== SAVINGS_SLUG,
    );
    const categoryOptions = categories.map(({ id, slug, name, color }) => ({
        id,
        slug,
        name,
        color,
    }));

    return (
        <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
            <header className="flex items-baseline justify-between">
                <h1 className="text-2xl font-bold">Settlement</h1>
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
                    categories={categoryOptions}
                    defaultCategoryId={defaultCategory?.id}
                    direction={settlement.balance.direction}
                    netAmount={settlement.balance.amount}
                />
                <SettlementBreakdown balance={settlement.balance} />
                <SettlementJournal journal={settlement.journal} />
            </div>
        </main>
    );
}

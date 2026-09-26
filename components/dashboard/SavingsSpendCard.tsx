import { ChevronRight } from "lucide-react";

import { Pot, PotParts } from "@/components/money/BreakdownParts";
import type { FundedExpense } from "@/components/money/FundingSplit";
import { MonthBreakdownDialog } from "@/components/money/MonthBreakdownDialog";
import {
    computeFeedTotals,
    computeSavingsSpend,
    nonIncomeFundedRows,
    type FeedTotalMovement,
} from "@/lib/domain/movement";

type Props = {
    expenses: FundedExpense[];
    movements: FeedTotalMovement[];
    monthLabel: string;
    partnerName: string;
    incomeTotal: number;
};

export function SavingsSpendCard({
    expenses,
    movements,
    monthLabel,
    partnerName,
    incomeTotal,
}: Props) {
    const savings = computeSavingsSpend(expenses, movements);
    if (savings.amount === 0) return null;
    const totals = computeFeedTotals(expenses, movements);

    return (
        <section aria-label="Spent from savings" className="min-w-0">
            <Pot
                tone="otherMoney"
                title="Spent from savings"
                amount={savings.amount}
                caption="Outside this month's income"
            >
                <div className="space-y-1.5">
                    <PotParts
                        headline={savings.amount}
                        parts={[
                            {
                                label: "Your purchases",
                                amount: savings.of.ownPurchases,
                            },
                            {
                                label: `Paid to ${partnerName}`,
                                amount: savings.of.paidToPartner,
                            },
                        ]}
                    />
                </div>
                <MonthBreakdownDialog
                    totals={totals}
                    monthLabel={monthLabel}
                    partnerName={partnerName}
                    incomeTotal={incomeTotal}
                    fundingRows={nonIncomeFundedRows(expenses)}
                    triggerClassName="mt-3 inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    trigger={
                        <>
                            View breakdown
                            <ChevronRight aria-hidden className="size-4" />
                        </>
                    }
                />
            </Pot>
        </section>
    );
}

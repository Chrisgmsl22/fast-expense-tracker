import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

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
    const t = useTranslations("dashboard.savingsSpend");
    const savings = computeSavingsSpend(expenses, movements);
    if (savings.amount === 0) return null;
    const totals = computeFeedTotals(expenses, movements);

    return (
        <section aria-label={t("title")} className="min-w-0">
            <Pot
                tone="otherMoney"
                title={t("title")}
                amount={savings.amount}
                caption={t("caption")}
            >
                <div className="space-y-1.5">
                    <PotParts
                        headline={savings.amount}
                        parts={[
                            {
                                label: t("ownPurchases"),
                                amount: savings.of.ownPurchases,
                            },
                            {
                                label: t("paidToPartner", {
                                    partner: partnerName,
                                }),
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
                            {t("viewBreakdown")}
                            <ChevronRight aria-hidden className="size-4" />
                        </>
                    }
                />
            </Pot>
        </section>
    );
}

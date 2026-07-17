import { AddExpenseButton } from "@/components/expense/AddExpenseButton";
import { MonthPicker } from "@/components/expense/MonthPicker";
import type {
    CardOption,
    CategoryOption,
    SubcategoryOption,
} from "@/components/expense/ExpenseForm";
import { formatMxn } from "@/lib/format";

/**
 * Dashboard topbar: month heading + nav, the month's total-income
 * chip, the "My view · NN%" share pill, and the capture button (reuses the
 * existing Add-expense dialog). The income "add" popover from the design is
 * deferred — income is captured on the Income screen.
 */
export function DashboardTopbar({
    month,
    monthLabel,
    incomeTotal,
    sharePercentage,
    categories,
    subcategories,
    cards,
    partnerName,
}: {
    month: string;
    monthLabel: string;
    incomeTotal: number;
    sharePercentage: number;
    categories: CategoryOption[];
    subcategories: SubcategoryOption[];
    cards: CardOption[];
    partnerName: string;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
                <h1 className="text-xl font-semibold whitespace-nowrap sm:text-2xl">
                    {monthLabel}
                </h1>
                <MonthPicker month={month} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border px-3 py-1 text-sm">
                    <span className="text-muted-foreground">Total income </span>
                    <span className="font-semibold">
                        {formatMxn(incomeTotal)}
                    </span>
                </span>
                <span className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
                    My view · {Math.round(sharePercentage * 100)}%
                </span>
                <AddExpenseButton
                    categories={categories}
                    subcategories={subcategories}
                    cards={cards}
                    defaultSharePercentage={sharePercentage}
                    partnerName={partnerName}
                />
            </div>
        </div>
    );
}

import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

/** Points a month with no income at the Income page, since every target is a share of income. */
export function IncomeNudge({
    incomeTotal,
    month,
}: {
    incomeTotal: number;
    month: string;
}) {
    const t = useTranslations("dashboard.incomeNudge");
    if (incomeTotal !== 0) return null;
    return (
        <Link
            href={`/income?month=${month}`}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
            <Wallet
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0">
                <span className="block text-sm font-medium">{t("title")}</span>
                <span className="block text-xs text-muted-foreground">
                    {t("body")}
                </span>
            </span>
            <ChevronRight
                aria-hidden
                className="ml-auto size-4 shrink-0 text-muted-foreground"
            />
        </Link>
    );
}

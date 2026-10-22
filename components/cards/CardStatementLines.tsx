import { useTranslations } from "next-intl";

import type { CardStatement } from "@/lib/domain/card-balance";
import { formatMxn } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
    statement: CardStatement;
    monthName: string;
    className?: string;
};

/** Charged − paid − redeemed for the month: the lines behind its balance. */
export function CardStatementLines({ statement, monthName, className }: Props) {
    const t = useTranslations("money.cards.lines");
    const values = { month: monthName };
    return (
        <dl
            className={cn(
                "grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-1 text-xs tabular-nums",
                className,
            )}
        >
            <dt className="text-muted-foreground">{t("charged", values)}</dt>
            <dd
                className={cn(
                    "text-right",
                    statement.charged === 0 && "text-muted-foreground",
                )}
            >
                + {formatMxn(statement.charged)}
            </dd>
            <dt className="text-muted-foreground">{t("paid", values)}</dt>
            {/* The payment tint marks money that moved: a zero reads like any other. */}
            <dd
                className={cn(
                    "text-right",
                    statement.paid > 0
                        ? "text-payment"
                        : "text-muted-foreground",
                )}
            >
                − {formatMxn(statement.paid)}
            </dd>
            <dt className="text-muted-foreground">{t("redeemed", values)}</dt>
            <dd className="text-right text-muted-foreground">
                − {formatMxn(statement.redeemed)}
            </dd>
        </dl>
    );
}

import type { CardStatement } from "@/lib/domain/card-balance";
import { formatBalance, formatMxn } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
    statement: CardStatement;
    monthName: string;
    className?: string;
};

/** Opening balance + charged − paid − redeemed for the month, as on a bank statement. */
export function CardStatementLines({ statement, monthName, className }: Props) {
    return (
        <dl
            className={cn(
                "grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-1 text-xs tabular-nums",
                className,
            )}
        >
            <dt className="text-muted-foreground">Opening balance</dt>
            <dd className="text-right">{formatBalance(statement.opening)}</dd>
            <dt className="text-muted-foreground">Charged in {monthName}</dt>
            <dd className="text-right">+ {formatMxn(statement.charged)}</dd>
            <dt className="text-muted-foreground">Paid in {monthName}</dt>
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
            <dt className="text-muted-foreground">Redeemed in {monthName}</dt>
            <dd className="text-right text-muted-foreground">
                − {formatMxn(statement.redeemed)}
            </dd>
        </dl>
    );
}

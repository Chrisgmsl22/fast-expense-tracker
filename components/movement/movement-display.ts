import type { MovementType } from "@/lib/domain/movement";
import { PARTNER_NAME } from "@/lib/partner";

/**
 * Label + colour tone for a movement row — the single source both feeds
 * (dashboard `MonthFeed`, expenses `ExpenseListInteractive`) read, so a new
 * movement type can't slip through and get mislabelled. Card payment = blue,
 * money you sent = amber (transfer out), money she sent you = green (money in).
 */
export type MovementDisplay = {
    label: string;
    amountClass: string;
    rowTint: string;
};

export function movementDisplay(type: MovementType): MovementDisplay {
    switch (type) {
        case "card_payment":
            return {
                label: "Card payment",
                amountClass: "text-payment",
                rowTint: "border-payment bg-payment-tint",
            };
        case "gf_received":
            return {
                label: `${PARTNER_NAME} paid you`,
                amountClass: "text-positive",
                rowTint: "border-positive bg-positive-tint",
            };
        // gf_paid (money you sent) + any non-card fallback.
        default:
            return {
                label: `Paid ${PARTNER_NAME}`,
                amountClass: "text-transfer",
                rowTint: "border-transfer bg-transfer-tint",
            };
    }
}

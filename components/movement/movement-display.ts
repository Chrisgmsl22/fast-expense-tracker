import type { MovementType } from "@/lib/domain/movement";

/**
 * Label + colour tone for a movement row — the single source both feeds
 * (dashboard `MonthFeed`, expenses `ExpenseListInteractive`) read, so a new
 * movement type can't slip through and get mislabelled. Card payment = blue,
 * money you sent = gold (transfer out), money she sent you = green (money in).
 * `partnerName` is threaded as data (spec 0006).
 */
export type MovementDisplay = {
    label: string;
    amountClass: string;
    rowTint: string;
};

export function movementDisplay(
    type: MovementType,
    partnerName: string,
): MovementDisplay {
    switch (type) {
        case "card_payment":
            return {
                label: "Card payment",
                amountClass: "text-payment",
                rowTint: "border-payment bg-payment-tint",
            };
        case "gf_received":
            return {
                label: `${partnerName} paid you`,
                amountClass: "text-positive",
                rowTint: "border-positive bg-positive-tint",
            };
        // No `gf_fronted` case: a debt she fronted never reaches a feed now (spec 0007
        // §6b) — the month query excludes it and the journal renders its own rows.
        // gf_paid (money you sent) + any non-card fallback.
        default:
            return {
                label: `Paid ${partnerName}`,
                amountClass: "text-transfer",
                rowTint: "border-transfer bg-transfer-tint",
            };
    }
}

type MovementRowSource = {
    type: MovementType;
    note: string | null;
    card: { name: string } | null;
};

/**
 * The two text lines of a feed row, shared by both feeds so a movement reads the
 * same on the dashboard and on the expenses list. The caller prefixes the date.
 */
export function movementRowText(
    m: MovementRowSource,
    partnerName: string,
): { title: string; subline: string } {
    const { label } = movementDisplay(m.type, partnerName);
    const note = m.note?.trim() ?? "";
    return {
        title: label,
        subline: m.type === "card_payment" ? (m.card?.name ?? "") : note,
    };
}

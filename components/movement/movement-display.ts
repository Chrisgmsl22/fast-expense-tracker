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
        // No cash left your account, so this row is information only and enters
        // no total (ADR-0020). Tone matches the settlement journal's debt rows.
        case "gf_fronted":
            return {
                label: `I owe ${partnerName}`,
                amountClass: "text-debt",
                rowTint: "border-debt bg-debt-tint",
            };
        // gf_paid (money you sent) + any non-card fallback.
        default:
            return {
                label: `Paid ${partnerName}`,
                amountClass: "text-transfer",
                rowTint: "border-transfer bg-transfer-tint",
            };
    }
}

/** The minimum a feed row needs to write its two lines. */
type MovementRowSource = {
    type: MovementType;
    note: string | null;
    card: { name: string } | null;
};

/**
 * The two text lines of a feed row: a title and an optional subline (the date is
 * prefixed by the caller). Both feeds share this so a debt reads the same on the
 * dashboard and on the expenses list. A debt's note *names the thing she
 * fronted*, so it becomes the title and the generic label drops to the subline;
 * with no note the label is the title, matching the settlement journal.
 */
export function movementRowText(
    m: MovementRowSource,
    partnerName: string,
): { title: string; subline: string } {
    const { label } = movementDisplay(m.type, partnerName);
    const note = m.note?.trim() ?? "";
    if (m.type === "gf_fronted") {
        return note
            ? { title: note, subline: label }
            : { title: label, subline: "" };
    }
    return {
        title: label,
        subline: m.type === "card_payment" ? (m.card?.name ?? "") : note,
    };
}

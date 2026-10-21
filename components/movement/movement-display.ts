import type { useTranslations } from "next-intl";

import { isPartnerPaymentAutoLabel } from "@/lib/domain/expense";
import {
    partnerDebtLabel,
    type MovementType,
    type PartnerDebtDirection,
} from "@/lib/domain/movement";

export type MovementsTranslator = ReturnType<
    typeof useTranslations<"movements">
>;

/**
 * Colour tone for a movement row — the single source both feeds (dashboard
 * `MonthFeed`, expenses `ExpenseListInteractive`) read, so a new movement type
 * can't slip through and get mis-toned. Card payment = blue, money you sent =
 * gold (transfer out), money she sent you = green (money in).
 */
export type MovementDisplay = {
    amountClass: string;
    rowTint: string;
};

export function movementDisplay(type: MovementType): MovementDisplay {
    switch (type) {
        case "card_payment":
            return {
                amountClass: "text-payment",
                rowTint: "border-payment bg-payment-tint",
            };
        case "gf_received":
            return {
                amountClass: "text-positive",
                rowTint: "border-positive bg-positive-tint",
            };
        // No `gf_fronted` case: a debt she fronted never reaches a feed now (spec 0007
        // §6b) — the month query excludes it and the journal renders its own rows.
        // gf_paid (money you sent) + any non-card fallback.
        default:
            return {
                amountClass: "text-transfer",
                rowTint: "border-transfer bg-transfer-tint",
            };
    }
}

/** A movement row's label. `partnerName` is threaded as data (spec 0006). */
export function movementLabel(
    type: MovementType,
    partnerName: string,
    t: MovementsTranslator,
): string {
    switch (type) {
        case "card_payment":
            return t("display.cardPayment");
        case "gf_received":
            return t("display.partnerPaidYou", { partner: partnerName });
        default:
            return t("display.paidPartner", { partner: partnerName });
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
    t: MovementsTranslator,
): { title: string; subline: string } {
    const note = m.note?.trim() ?? "";
    return {
        title: movementLabel(m.type, partnerName, t),
        subline: m.type === "card_payment" ? (m.card?.name ?? "") : note,
    };
}

/** "I owe {partner}" / "{partner} owes me", in the active locale. */
export function debtLabel(
    direction: PartnerDebtDirection,
    partnerName: string,
    t: MovementsTranslator,
): string {
    return t(`debtLabel.${direction}`, { partner: partnerName });
}

/**
 * A debt row's title. The settlement service fills a note-less debt's description
 * with the English auto-label (`partnerDebtLabel`), so that one shows in the active
 * locale; the user's own note shows as typed.
 */
export function debtTitle(
    description: string,
    direction: PartnerDebtDirection,
    partnerName: string,
    t: MovementsTranslator,
): string {
    return description === partnerDebtLabel(direction, partnerName)
        ? debtLabel(direction, partnerName, t)
        : description;
}

/**
 * A partner payment's title. A note-less payment stores the English auto-label
 * (`partnerPaymentDescription`), so that one shows in the active locale; the user's
 * own note shows as typed.
 */
export function paymentTitle(
    description: string,
    partnerName: string,
    t: MovementsTranslator,
): string {
    return isPartnerPaymentAutoLabel(description)
        ? t("display.transferYouPaid", { partner: partnerName })
        : description;
}

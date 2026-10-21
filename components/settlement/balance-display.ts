import type { useTranslations } from "next-intl";

import type { SettlementDirection } from "@/lib/domain/settlement";

export type SettlementTranslator = ReturnType<
    typeof useTranslations<"settlement">
>;

/**
 * Presentation for a balance direction — the single source both the settlement
 * hero and the dashboard chip read, so their colour/label never drift. Green =
 * she owes you (money coming in), amber = you owe her (matches the "money to
 * {partner}" transfer tone), grey = settled. (The `--transfer` amber is the same
 * token the "I paid {partner}" feed line uses.) `partnerName` is threaded as data
 * (spec 0006) so labels read with the user's own partner.
 */
export type BalanceTone = {
    /** Uppercase hero label, e.g. "PARTNER OWES YOU". */
    label: string;
    /** Sentence-case chip label, e.g. "Partner owes you". */
    chipLabel: string;
    dotClass: string;
    textClass: string;
    /** Bar/chip fill background. */
    fillClass: string;
    tintClass: string;
    borderClass: string;
};

export function balanceTone(
    direction: SettlementDirection,
    partnerName: string,
    t: SettlementTranslator,
): BalanceTone {
    switch (direction) {
        case "she_owes": {
            const chipLabel = t("tone.sheOwes", { partner: partnerName });
            return {
                label: chipLabel.toUpperCase(),
                chipLabel,
                dotClass: "bg-positive",
                textClass: "text-positive",
                fillClass: "bg-positive",
                tintClass: "bg-positive-tint",
                borderClass: "border-positive",
            };
        }
        case "you_owe": {
            const chipLabel = t("tone.youOwe", { partner: partnerName });
            return {
                label: chipLabel.toUpperCase(),
                chipLabel,
                dotClass: "bg-transfer",
                textClass: "text-transfer",
                fillClass: "bg-transfer",
                tintClass: "bg-transfer-tint",
                borderClass: "border-transfer",
            };
        }
        case "settled": {
            const chipLabel = t("tone.settled");
            return {
                label: chipLabel.toUpperCase(),
                chipLabel,
                dotClass: "bg-muted-foreground",
                textClass: "text-muted-foreground",
                fillClass: "bg-muted-foreground",
                tintClass: "bg-muted",
                borderClass: "border-border",
            };
        }
    }
}

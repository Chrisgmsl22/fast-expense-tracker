import type { SettlementDirection } from "@/lib/domain/settlement";

/**
 * Presentation for a balance direction — the single source both the settlement
 * hero and the dashboard chip read, so their colour/label never drift. Green =
 * she owes you (money coming in), amber = you owe her (matches the "money to
 * {partner}" transfer tone), grey = settled. (The `--transfer` amber is the same
 * token the "I paid {partner}" feed line uses.) `partnerName` is threaded as data
 * (spec 0006) so labels read with the user's own partner.
 */
export type BalanceTone = {
    /** Uppercase hero label, e.g. "BRENDA OWES YOU". */
    label: string;
    /** Sentence-case chip label, e.g. "Brenda owes you". */
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
): BalanceTone {
    switch (direction) {
        case "she_owes":
            return {
                label: `${partnerName.toUpperCase()} OWES YOU`,
                chipLabel: `${partnerName} owes you`,
                dotClass: "bg-positive",
                textClass: "text-positive",
                fillClass: "bg-positive",
                tintClass: "bg-positive-tint",
                borderClass: "border-positive",
            };
        case "you_owe":
            return {
                label: `YOU OWE ${partnerName.toUpperCase()}`,
                chipLabel: `You owe ${partnerName}`,
                dotClass: "bg-transfer",
                textClass: "text-transfer",
                fillClass: "bg-transfer",
                tintClass: "bg-transfer-tint",
                borderClass: "border-transfer",
            };
        case "settled":
            return {
                label: "ALL SETTLED",
                chipLabel: "All settled",
                dotClass: "bg-muted-foreground",
                textClass: "text-muted-foreground",
                fillClass: "bg-muted-foreground",
                tintClass: "bg-muted",
                borderClass: "border-border",
            };
    }
}

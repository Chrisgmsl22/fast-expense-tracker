import {
    NON_INCOME_FUNDED_LABEL,
    NON_INCOME_FUNDED_SHORT_LABEL,
    ofWhichPaidToPartner,
    ofWhichPaidToPartnerShort,
} from "@/lib/domain/funding";
import type { FeedTotals } from "@/lib/domain/movement";

/** Which money system a figure belongs to — the chin and the modal read the same map. */
export type MoneyTone =
    | "plain"
    | "spent"
    | "savings"
    | "otherMoney"
    | "partner"
    | "positive";

/**
 * The CSS custom property behind each tone, for SVG strokes and dots. `plain` is a
 * grey: it makes no system claim, so any number of neutral rows may sit together.
 * Every other pair that can ever be adjacent is pinned in `summary-model.test.ts`.
 */
export const TONE_COLOR: Record<MoneyTone, string> = {
    plain: "var(--muted-foreground)",
    spent: "var(--spent)",
    savings: "var(--bucket-savings)",
    otherMoney: "var(--bucket-discretionary)",
    partner: "var(--transfer)",
    positive: "var(--positive)",
};

export const TONE_TEXT_CLASS: Record<MoneyTone, string> = {
    plain: "text-foreground",
    spent: "text-spent",
    savings: "text-bucket-savings",
    otherMoney: "text-bucket-discretionary",
    partner: "text-transfer",
    positive: "text-positive",
};

/** A part of a line. It renders inside its parent and carries no tone of its own. */
export type SummaryPart = {
    key: string;
    label: string;
    /** For the pinned mobile bar, where the full label does not fit. */
    shortLabel?: string;
    amount: number;
};

export type SummaryLine = SummaryPart & {
    tone: MoneyTone;
    /** Figures this line is made of — rendered inside it, never beside it. */
    of: SummaryPart[];
};

/** What a re-cut figure says about itself, so it never reads as extra money. */
export const ALSO_COUNTED_ABOVE =
    "part of this is already inside the figures above";

/**
 * The month's figures as one hierarchy, shared by the dashboard rail and the
 * expenses bar so the two screens cannot organise the same numbers differently.
 * A zero figure is dropped rather than printed: an empty savings pot is not $0.00.
 */
export function summaryLines(
    totals: FeedTotals,
    partnerName: string,
): SummaryLine[] {
    const ofWhichPaid = ofWhichPaidToPartner(partnerName);
    const ofWhichPaidShort = ofWhichPaidToPartnerShort(partnerName);
    const lines: SummaryLine[] = nonZero([
        {
            key: "charged",
            label: "Charged",
            amount: totals.charged.amount,
            tone: "plain",
            of: [],
        },
        {
            key: "spent",
            label: "What I really spent",
            amount: totals.whatIReallySpent.amount,
            tone: "spent",
            of: nonZero([
                {
                    key: "spent-partner",
                    label: ofWhichPaid,
                    shortLabel: ofWhichPaidShort,
                    amount: totals.whatIReallySpent.of.sentToPartner,
                },
            ]),
        },
    ]);

    if (totals.setAside > 0) {
        lines.push({
            key: "set-aside",
            label: "Set aside",
            amount: totals.setAside,
            tone: "savings",
            of: [],
        });
    }

    if (totals.notFromIncome.amount > 0) {
        lines.push({
            key: "not-from-income",
            label: NON_INCOME_FUNDED_LABEL,
            shortLabel: NON_INCOME_FUNDED_SHORT_LABEL,
            amount: totals.notFromIncome.amount,
            tone: "otherMoney",
            of: nonZero([
                {
                    key: "not-from-income-partner",
                    label: ofWhichPaid,
                    shortLabel: ofWhichPaidShort,
                    amount: totals.notFromIncome.of.sentToPartner,
                },
            ]),
        });
    }

    // Neutral, not green: any line here can drop out, so the settlement chip above
    // the chin owns her colour and no two coloured rows can meet by accident.
    if (totals.partnerPaidYou > 0) {
        lines.push({
            key: "partner-paid-you",
            label: `${partnerName} paid you`,
            amount: totals.partnerPaidYou,
            tone: "plain",
            of: [],
        });
    }

    // Legacy transfers are the only money the lines above have not already
    // stated, so they get a line of their own rather than a rollup that would
    // print the payment-expenses a second time (spec 0007 §6a, ADR-0024).
    const paid = totals.paidToPartner;
    if (paid.of.fromIncome.of.fromLegacyTransfers > 0) {
        lines.push({
            key: "transfers",
            label: `Transfers to ${partnerName}`,
            shortLabel: `To ${partnerName}`,
            amount: paid.of.fromIncome.of.fromLegacyTransfers,
            tone: "plain",
            of: [],
        });
    }
    if (paid.of.notFromIncome.of.fromLegacyTransfers > 0) {
        lines.push({
            key: "transfers-not-from-income",
            label: `Transfers to ${partnerName} (not from income)`,
            shortLabel: ofWhichPaidShort,
            amount: paid.of.notFromIncome.of.fromLegacyTransfers,
            tone: "plain",
            of: [],
        });
    }

    return lines;
}

/**
 * Money from ANOTHER month that left: savings-funded consumption plus the legacy
 * transfers that have no expense row yet (spec 0007 §6a carve-out). `total` is the
 * same question asked of this month's income, so the two pots partition the month.
 */
export function otherMoneyThatLeft(totals: FeedTotals): number {
    return (
        totals.notFromIncome.amount +
        totals.paidToPartner.of.notFromIncome.of.fromLegacyTransfers
    );
}

/**
 * The closing figure, or null when it would only restate "what I really spent" —
 * a Total repeating the line above it says nothing (spec 0007 §6a).
 */
export function closingTotal(totals: FeedTotals): number | null {
    return totals.total === totals.whatIReallySpent.amount
        ? null
        : totals.total;
}

/** A whole-number share for a legend, or null when there is nothing to compare against. */
export function percentLabel(part: number, whole: number): string | null {
    if (whole <= 0) return null;
    return `${Math.round((part / whole) * 100)}%`;
}

function nonZero<T extends { amount: number }>(lines: T[]): T[] {
    return lines.filter((l) => l.amount > 0);
}

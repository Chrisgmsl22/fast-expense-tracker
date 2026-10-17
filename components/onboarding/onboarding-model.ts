import type { Ref } from "react";

import type { BudgetRule } from "@/lib/domain/budget-rule";
import type { BucketKey } from "@/lib/domain/dashboard";
import type {
    OnboardingCard,
    OnboardingData,
} from "@/lib/onboarding/load-onboarding";

export const STEP_COUNT = 8;

/** Where the share slider starts for someone who has not said they share yet. */
export const FIRST_SHARE_PERCENT = 50;

/** Category chips shown on a phone before the rest fold into "+N more". */
export const PHONE_CHIP_LIMIT = 6;

export type ShareChoice = "yes" | "solo";

export type SharingValues = {
    choice: ShareChoice | null;
    partnerName: string;
    percent: number;
    /** The share already in Settings, kept for "Just me" when the slider never moved. */
    savedPercent: number;
    sliderMoved: boolean;
};

export type BudgetDraft = Record<BucketKey, string>;

/** Everything the user has typed or saved so far; it outlives each step so Back keeps it. */
export type WizardValues = {
    name: string;
    sharing: SharingValues;
    income: string;
    budget: BudgetDraft;
    cards: OnboardingCard[];
};

export const BUCKETS: ReadonlyArray<{
    key: BucketKey;
    label: string;
    helper: string;
    accent: string;
    fill: string;
}> = [
    {
        key: "essentials",
        label: "Essentials",
        helper: "Rent, groceries, utilities, health",
        accent: "border-t-bucket-essentials",
        fill: "bg-bucket-essentials",
    },
    {
        key: "discretionary",
        label: "Discretionary",
        helper: "Eating out, fun, wants",
        accent: "border-t-bucket-discretionary",
        fill: "bg-bucket-discretionary",
    },
    {
        key: "savings",
        label: "Investing / Savings",
        helper: "Its own bucket — pay yourself first",
        accent: "border-t-bucket-savings",
        fill: "bg-bucket-savings",
    },
];

export function toBudgetDraft(rule: BudgetRule): BudgetDraft {
    return {
        essentials: String(rule.essentials),
        discretionary: String(rule.discretionary),
        savings: String(rule.savings),
    };
}

export function budgetDraftTotal(draft: BudgetDraft): number {
    return BUCKETS.reduce((sum, { key }) => sum + (Number(draft[key]) || 0), 0);
}

/** A bar width for a typed percent, kept inside 0-100 so a typo never overflows the row. */
export function barPercent(value: string): number {
    return Math.min(100, Math.max(0, Number(value) || 0));
}

export function initialValues(data: OnboardingData): WizardValues {
    const { sharesExpenses, partnerName, sharePercent } = data.sharing;
    return {
        name: data.name,
        sharing: {
            choice: sharesExpenses ? "yes" : null,
            partnerName,
            percent: sharesExpenses ? sharePercent : FIRST_SHARE_PERCENT,
            savedPercent: sharePercent,
            sliderMoved: false,
        },
        income: data.fixedIncome > 0 ? String(data.fixedIncome) : "",
        budget: toBudgetDraft(data.budgetRule),
        cards: data.cards,
    };
}

/** "Yes" saves what the slider shows; "Just me" keeps the saved share unless the slider moved. */
export function sharePercentToSave(values: SharingValues): number {
    return values.choice === "yes" || values.sliderMoved
        ? values.percent
        : values.savedPercent;
}

/** Drops spaces and thousands separators so "44,000" reaches the server as "44000". */
export function normalizeAmount(value: string): string {
    return value.replace(/[\s,]/g, "");
}

/** An empty or zero income means "nothing to save", not "clear my income". */
export function isBlankAmount(normalized: string): boolean {
    return normalized === "" || Number(normalized) === 0;
}

export function partnerLabel(partnerName: string): string {
    return partnerName.trim() || "Partner";
}

/** What every step gets from the wizard to move between steps. */
export type StepNav = {
    headingRef: Ref<HTMLHeadingElement>;
    onBack: () => void;
    onNext: () => void;
};

import { getTranslations } from "next-intl/server";

import type { Translations } from "@/lib/actions/field-errors";

// Keys are the English messages in lib/schemas/settings.ts and budget-rule.ts.
export async function splitRuleMessages(): Promise<Translations> {
    const t = await getTranslations("settings.split.errors");
    return {
        "Name is too long": t("nameTooLong"),
        "Enter a whole number": t("wholeNumber"),
        "Must be at least 1%": t("min"),
        "Can't exceed 100%": t("max"),
        "Add your partner's name to share expenses": t("partnerRequired"),
        "Enter your share (1–100%)": t("shareRequired"),
    };
}

export async function budgetRuleMessages(): Promise<Translations> {
    const t = await getTranslations("settings.budget.errors");
    return {
        "Enter a whole number": t("wholeNumber"),
        "Must be at least 0%": t("min"),
        "Can't exceed 100%": t("max"),
        "The three buckets must add up to 100%": t("sumTo100"),
    };
}

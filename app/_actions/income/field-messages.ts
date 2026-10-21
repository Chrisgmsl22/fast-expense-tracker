import type { Translations } from "@/lib/actions/field-errors";
import { FUTURE_DATE_MESSAGE } from "@/lib/schemas/capture-date";
import type { Messages } from "@/i18n/messages";

export type IncomeFieldKey = keyof Messages["income"]["fields"];

// Keys are the English messages in lib/schemas/income.ts and capture-date.ts.
export function incomeSchemaMessages(
    t: (key: `fields.${IncomeFieldKey}`) => string,
): Translations {
    return {
        "Source is required": t("fields.sourceRequired"),
        "Amount must be greater than 0": t("fields.amountPositive"),
        "Amount can't be negative": t("fields.amountNotNegative"),
        "Month must be YYYY-MM": t("fields.monthFormat"),
        "Month can't be before 2000": t("fields.monthTooEarly"),
        [FUTURE_DATE_MESSAGE]: t("fields.futureDate"),
    };
}

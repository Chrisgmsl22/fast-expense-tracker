import { translateFieldErrors } from "@/app/_actions/expense/field-messages";
import type { FieldErrors } from "@/lib/actions/result";
import { FUTURE_DATE_MESSAGE } from "@/lib/schemas/capture-date";
import type { Messages } from "@/i18n/messages";

export type IncomeFieldKey = keyof Messages["income"]["fields"];

// Same approach as the expense map: the shared schema keeps English, a known message
// maps to a key, and a zod default passes through as written.
const SCHEMA_MESSAGE_KEYS: Readonly<Record<string, IncomeFieldKey>> = {
    "Source is required": "sourceRequired",
    "Amount must be greater than 0": "amountPositive",
    "Amount can't be negative": "amountNotNegative",
    "Month must be YYYY-MM": "monthFormat",
    "Month can't be before 2000": "monthTooEarly",
    [FUTURE_DATE_MESSAGE]: "futureDate",
};

export function translateIncomeFieldErrors<TInput>(
    fieldErrors: FieldErrors<TInput>,
    t: (key: `fields.${IncomeFieldKey}`) => string,
): FieldErrors<TInput> {
    return translateFieldErrors(fieldErrors, (message) => {
        const key = Object.hasOwn(SCHEMA_MESSAGE_KEYS, message)
            ? SCHEMA_MESSAGE_KEYS[message]
            : undefined;
        return key ? t(`fields.${key}`) : message;
    });
}

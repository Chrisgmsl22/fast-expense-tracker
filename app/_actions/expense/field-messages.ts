import type { FieldErrors } from "@/lib/actions/result";
import {
    isExpenseFrozen,
    type ExpenseCycleFacts,
    type FrozenAction,
} from "@/lib/domain/frozen-row";
import { REIMBURSABLE_CATEGORY_SLUG } from "@/lib/domain/funding";
import { FUTURE_DATE_MESSAGE } from "@/lib/schemas/capture-date";
import type { Messages } from "@/i18n/messages";

export type ExpenseFieldKey = keyof Messages["expenses"]["fields"];

type FrozenKey = keyof Messages["expenses"]["errors"]["frozen"];

// The shared zod schemas keep their English messages because other screens parse them
// too. Each known message maps to a key here; a message with no key (a zod default)
// passes through as written.
const SCHEMA_MESSAGE_KEYS: Readonly<Record<string, ExpenseFieldKey>> = {
    "Amount must be greater than 0": "amountPositive",
    "Category is required": "categoryRequired",
    "Description is required": "descriptionRequired",
    "A shared expense needs your share below 100%": "sharedBelowFull",
    [`Only ${REIMBURSABLE_CATEGORY_SLUG} expenses can be marked reimbursed. Change the funding source before moving this expense to another category.`]:
        "reimbursedHealthOnly",
    [FUTURE_DATE_MESSAGE]: "futureDate",
};

/** Rewrites every message through `translate`, keeping the fields as they were. */
export function translateFieldErrors<TInput>(
    fieldErrors: FieldErrors<TInput>,
    translate: (message: string) => string,
): FieldErrors<TInput> {
    const translated: FieldErrors<TInput> = {};
    for (const field in fieldErrors) {
        translated[field] = fieldErrors[field]?.map(translate);
    }
    return translated;
}

export function translateExpenseFieldErrors<TInput>(
    fieldErrors: FieldErrors<TInput>,
    t: (key: `fields.${ExpenseFieldKey}`) => string,
): FieldErrors<TInput> {
    return translateFieldErrors(fieldErrors, (message) => {
        const key = Object.hasOwn(SCHEMA_MESSAGE_KEYS, message)
            ? SCHEMA_MESSAGE_KEYS[message]
            : undefined;
        return key ? t(`fields.${key}`) : message;
    });
}

/** The refusal key for a frozen expense, or null when nothing freezes it. */
export function frozenRefusalKey(
    e: ExpenseCycleFacts,
    action: FrozenAction,
): FrozenKey | null {
    if (!isExpenseFrozen(e)) return null;
    if (e.isPartnerPayment) {
        return action === "edit" ? "paymentEdit" : "paymentDelete";
    }
    return action === "edit" ? "expenseEdit" : "expenseDelete";
}

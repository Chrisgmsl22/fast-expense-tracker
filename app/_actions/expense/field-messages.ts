import type { Translations } from "@/lib/actions/field-errors";
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

// Keys are the English messages in lib/schemas/expense.ts and capture-date.ts, which
// other screens parse too.
export function expenseSchemaMessages(
    t: (key: `fields.${ExpenseFieldKey}`) => string,
): Translations {
    return {
        "Amount must be greater than 0": t("fields.amountPositive"),
        "Category is required": t("fields.categoryRequired"),
        "Description is required": t("fields.descriptionRequired"),
        "A shared expense needs your share below 100%": t(
            "fields.sharedBelowFull",
        ),
        [`Only ${REIMBURSABLE_CATEGORY_SLUG} expenses can be marked reimbursed. Change the funding source before moving this expense to another category.`]:
            t("fields.reimbursedHealthOnly"),
        [FUTURE_DATE_MESSAGE]: t("fields.futureDate"),
    };
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

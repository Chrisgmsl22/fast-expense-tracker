import { getTranslations } from "next-intl/server";
import type { ZodError } from "zod";

import type { FieldErrors } from "@/lib/actions/result";
import {
    isMovementFrozen,
    type FrozenAction,
    type MovementCycleFacts,
} from "@/lib/domain/frozen-row";
import { isPartnerDebt } from "@/lib/domain/movement";

type Issue = ZodError["issues"][number];
type FieldErrorsTranslator = Awaited<
    ReturnType<typeof getTranslations<"movements.fieldErrors">>
>;

// The movement schemas (lib/schemas/movement) carry English messages, so the
// user-facing text is picked here from the field and the kind of failure.
function issueMessage(
    field: string,
    issue: Issue,
    t: FieldErrorsTranslator,
): string {
    if (field === "date" && issue.code === "custom") return t("futureDate");
    if (field === "amount" && issue.code === "too_small") {
        return t("amountPositive");
    }
    if (field === "cardId" && issue.code === "too_small") {
        return t("cardRequired");
    }
    if (field === "fundedFrom" && issue.code === "custom") {
        return t("savingsOutboundOnly");
    }
    if (field === "note" && issue.code === "too_big") {
        return t("noteTooLong", { max: Number(issue.maximum) });
    }
    return t("invalid");
}

/** `toFieldErrors`, with each message in the active locale. */
export async function translatedFieldErrors<TInput>(
    error: ZodError,
): Promise<FieldErrors<TInput>> {
    const t = await getTranslations("movements.fieldErrors");
    const fieldErrors: FieldErrors<TInput> = {};
    for (const issue of error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") {
            const field = key as keyof TInput;
            (fieldErrors[field] ??= []).push(issueMessage(key, issue, t));
        }
    }
    return fieldErrors;
}

/**
 * The refusal for a frozen movement in the active locale, or null when nothing
 * freezes it. Mirrors `frozenMovementRefusal` in lib/domain/frozen-row.
 */
export async function frozenMovementMessage(
    m: MovementCycleFacts,
    action: FrozenAction,
): Promise<string | null> {
    if (!isMovementFrozen(m)) return null;
    const t = await getTranslations("movements.frozen");
    if (m.closedAt) {
        return action === "edit"
            ? t("transferClosedEdit")
            : t("transferClosedDelete");
    }
    if (action === "delete") return t("rowDelete");
    return isPartnerDebt(m.type) ? t("debtEdit") : t("transferEdit");
}

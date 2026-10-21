"use server";

import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { localizeFieldErrors, toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { resolveSplitRule } from "@/lib/domain/settings";
import { settingsRepository } from "@/lib/repositories";
import type { SettingsRepository } from "@/lib/repositories/settings.repository";
import {
    splitRuleInputSchema,
    type SplitRuleInput,
} from "@/lib/schemas/settings";
import { splitRuleMessages } from "./schema-messages";

/** Failure modes the caller can branch on. */
export type SaveSplitRuleCode = "validation" | "unauthenticated" | "db_error";

export type SaveSplitRuleResult = ActionResult<
    { sharesExpenses: boolean },
    SplitRuleInput,
    SaveSplitRuleCode
>;

/**
 * Persist the Settings "Expense split rule" block (CHORE-6.a): the shared-expense
 * mode toggle, the partner name (required when sharing is on — enforced by the
 * schema), and your share %. IDOR-safe: the `userId` comes from the session, never
 * the client, so a user can only ever write their own settings row.
 */
export async function saveSplitRule(
    input: unknown,
    repo: SettingsRepository = settingsRepository,
): Promise<SaveSplitRuleResult> {
    const t = await getTranslations("settings");
    const parsed = splitRuleInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.fixFields"),
            fieldErrors: localizeFieldErrors(
                toFieldErrors<SplitRuleInput>(parsed.error),
                await splitRuleMessages(),
            ),
        };
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: t("errors.unauthenticated"),
        };
    }

    try {
        await repo.saveSplitRule(userId, resolveSplitRule(parsed.data));
        return {
            ok: true,
            data: { sharesExpenses: parsed.data.sharesExpenses },
        };
    } catch (e) {
        console.error("saveSplitRule: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("split.errors.dbError"),
        };
    }
}

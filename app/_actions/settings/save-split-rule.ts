"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { resolveSplitRule } from "@/lib/domain/settings";
import { settingsRepository } from "@/lib/repositories";
import type { SettingsRepository } from "@/lib/repositories/settings.repository";
import {
    splitRuleInputSchema,
    type SplitRuleInput,
} from "@/lib/schemas/settings";

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
    const parsed = splitRuleInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: toFieldErrors<SplitRuleInput>(parsed.error),
        };
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: "Not authenticated",
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
            message: "Could not save your settings. Please try again.",
        };
    }
}

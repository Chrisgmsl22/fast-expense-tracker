import { getSessionUserId } from "@/lib/auth/session";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import type { UserRepository } from "@/lib/repositories/user.repository";
import { safeErrorSummary } from "@/lib/safe-error";
import { displayNameSchema, type DisplayNameInput } from "@/lib/schemas/auth";

export type UpdateDisplayNameCode =
    | "validation"
    | "unauthenticated"
    | "db_error";

export type UpdateDisplayNameResult = ActionResult<
    { name: string },
    DisplayNameInput,
    UpdateDisplayNameCode
>;

export async function changeDisplayName(
    input: unknown,
    users: Pick<UserRepository, "updateName">,
): Promise<UpdateDisplayNameResult> {
    const parsed = displayNameSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Check the highlighted field.",
            fieldErrors: toFieldErrors<DisplayNameInput>(parsed.error),
        };
    }
    const { name } = parsed.data;

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: "Not authenticated",
        };
    }

    try {
        const changed = await users.updateName(userId, name);
        if (changed === 0) {
            return {
                ok: false,
                code: "unauthenticated",
                message: "Not authenticated",
            };
        }
    } catch (error) {
        console.error(
            "updateDisplayName: db write failed",
            safeErrorSummary(error),
        );
        return {
            ok: false,
            code: "db_error",
            message: "Could not save your name. Please try again.",
        };
    }

    return { ok: true, data: { name } };
}

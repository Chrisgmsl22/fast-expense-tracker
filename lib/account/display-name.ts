import { auth, unstable_update } from "@/auth";
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

/**
 * Rename the session user, then put the new name in the session token so the
 * sidebar shows it without a new login. Kept out of the `"use server"` module
 * so the repository is not a client-supplied parameter.
 */
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

    try {
        await unstable_update({ user: { name } });
    } catch (error) {
        // The name is saved; only the sidebar waits for the next sign-in.
        console.warn(
            "updateDisplayName: session refresh failed",
            safeErrorSummary(error),
        );
    }
    return { ok: true, data: { name } };
}

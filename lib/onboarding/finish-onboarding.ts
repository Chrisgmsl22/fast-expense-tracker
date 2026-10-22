import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import type { UserRepository } from "@/lib/repositories/user.repository";
import { safeErrorSummary } from "@/lib/safe-error";

export type CompleteOnboardingCode = "unauthenticated" | "db_error";

export type CompleteOnboardingResult = ActionResult<
    void,
    Record<string, never>,
    CompleteOnboardingCode
>;

/** Mark the session user as onboarded. A repeat call succeeds and keeps the first timestamp. */
export async function finishOnboarding(
    users: Pick<UserRepository, "markOnboarded">,
    now: () => Date = () => new Date(),
): Promise<CompleteOnboardingResult> {
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
        await users.markOnboarded(userId, now());
        return { ok: true, data: undefined };
    } catch (error) {
        console.error(
            "completeOnboarding: db write failed",
            safeErrorSummary(error),
        );
        return {
            ok: false,
            code: "db_error",
            message: "Could not finish setup. Please try again.",
        };
    }
}

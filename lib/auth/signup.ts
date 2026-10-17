import { signIn } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { isAtAccountCap } from "@/lib/domain/signup";
import type { SignupGate } from "@/lib/repositories/signup-gate";
import {
    EmailTakenError,
    type UserProvisioningRepository,
} from "@/lib/repositories/user-provisioning.repository";
import { safeErrorSummary } from "@/lib/safe-error";
import { signupSchema, type SignupInput } from "@/lib/schemas/auth";

/** Failure modes the signup form can branch on. */
export type SignupCode =
    | "validation"
    | "closed"
    | "full"
    | "email_taken"
    | "error";

export type SignupResult = ActionResult<void, SignupInput, SignupCode>;

const SIGNUP_MESSAGES = {
    validation: "Check the highlighted fields.",
    closed: "Sign-ups are closed right now.",
    full: "Sign-ups are currently full.",
    emailTaken: "An account with this email already exists.",
    error: "Something went wrong. Please try again.",
    signInFailed:
        "Your account is ready, but signing in failed. Please log in.",
} as const;

/**
 * Create an account with its starter kit, then sign it in. The switch and the
 * cap are checked before any write (ADR-0026).
 *
 * Kept out of the `"use server"` module: every parameter of an exported server
 * action is client-supplied, so the gate and the repository cannot be
 * parameters of `signupAction` itself.
 */
export async function signup(
    input: unknown,
    gate: SignupGate,
    accounts: UserProvisioningRepository,
): Promise<SignupResult> {
    const parsed = signupSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: SIGNUP_MESSAGES.validation,
            fieldErrors: toFieldErrors<SignupInput>(parsed.error),
        };
    }
    const { name, email, password } = parsed.data;

    let userCount: number;
    let maxUsers: number;
    try {
        const gateState = await gate.read();
        if (!gateState.open) {
            return {
                ok: false,
                code: "closed",
                message: SIGNUP_MESSAGES.closed,
            };
        }
        maxUsers = gateState.maxUsers;
        userCount = await accounts.countUsers();
    } catch (error) {
        console.error(
            "signupAction: signup failed before sign-in",
            safeErrorSummary(error),
        );
        return { ok: false, code: "error", message: SIGNUP_MESSAGES.error };
    }

    if (isAtAccountCap(userCount, maxUsers)) {
        console.info("signupAction: refused, the account cap is reached", {
            userCount,
            maxUsers,
        });
        return { ok: false, code: "full", message: SIGNUP_MESSAGES.full };
    }

    try {
        const { userId } = await accounts.createUserWithStarterKit({
            name,
            email,
            password,
        });
        console.info("signupAction: account created", { userId });
    } catch (error) {
        if (error instanceof EmailTakenError) {
            return {
                ok: false,
                code: "email_taken",
                message: SIGNUP_MESSAGES.emailTaken,
                fieldErrors: { email: [SIGNUP_MESSAGES.emailTaken] },
            };
        }
        console.error(
            "signupAction: account creation failed",
            safeErrorSummary(error),
        );
        return { ok: false, code: "error", message: SIGNUP_MESSAGES.error };
    }

    try {
        await signIn("credentials", {
            email,
            password,
            redirectTo: "/dashboard",
            redirect: false,
        });
    } catch (error) {
        console.error(
            "signupAction: sign-in after signup failed",
            safeErrorSummary(error),
        );
        return {
            ok: false,
            code: "error",
            message: SIGNUP_MESSAGES.signInFailed,
        };
    }

    return { ok: true, data: undefined };
}

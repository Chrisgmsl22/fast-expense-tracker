"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import type { ActionResult, FieldErrors } from "@/lib/actions/result";

/** Failure modes the login form can branch on. */
export type LoginCode = "validation" | "invalid_credentials" | "error";

export type LoginResult = ActionResult<void, LoginInput, LoginCode>;

/** Authenticate credentials and return a result without a redirect. */
export async function loginAction(input: unknown): Promise<LoginResult> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
        const fieldErrors: FieldErrors<LoginInput> = {};
        for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") {
                const field = key as keyof LoginInput;
                (fieldErrors[field] ??= []).push(issue.message);
            }
        }
        return {
            ok: false,
            code: "validation",
            message: "Enter a valid email and password.",
            fieldErrors,
        };
    }

    try {
        await signIn("credentials", {
            email: parsed.data.email,
            password: parsed.data.password,
            redirectTo: "/dashboard",
            redirect: false,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            // `authorize` returning null surfaces as `CredentialsSignin`. A
            // thrown `authorize` (e.g. DB outage) is wrapped as
            // `CallbackRouteError` — also an `AuthError`, so we must narrow on
            // `type`, or an infra failure would be reported as a bad password.
            if (error.type === "CredentialsSignin") {
                // Same message for unknown email and wrong password — don't
                // reveal which one exists.
                return {
                    ok: false,
                    code: "invalid_credentials",
                    message: "Invalid email or password.",
                };
            }
            // Any other auth error is unexpected — surface a generic failure
            // (not a credentials error) and log server-side for diagnosis.
            console.error("loginAction: unexpected auth error", error);
            return {
                ok: false,
                code: "error",
                message: "Something went wrong. Please try again.",
            };
        }
        throw error;
    }

    return { ok: true, data: undefined };
}

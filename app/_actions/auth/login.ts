"use server";

import { failureAttributes } from "@/lib/observability/health";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { signIn, InvalidCredentialsError } from "@/auth";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import type { ActionResult, FieldErrors } from "@/lib/actions/result";
import { localizeFieldErrors } from "@/lib/actions/field-errors";
import { authMessages } from "./schema-messages";
import { logAppEvent } from "@/lib/observability/log";

/** Failure modes the login form can branch on. */
export type LoginCode = "validation" | "invalid_credentials" | "error";

/** `data` is the next OAuth URL when the login continues an authorization. */
export type LoginResult = ActionResult<
    string | undefined,
    LoginInput,
    LoginCode
>;

const loginRequestSchema = loginSchema.extend({
    oauthQuery: z.string().min(1).max(8192).optional(),
});

/** Authenticate credentials and return a result without a redirect. */
export async function loginAction(input: unknown): Promise<LoginResult> {
    const t = await getTranslations("auth.errors");
    const parsed = loginRequestSchema.safeParse(input);
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
            message: t("loginInvalid"),
            fieldErrors: localizeFieldErrors(fieldErrors, await authMessages()),
        };
    }

    let next: string | undefined;
    try {
        next = await signIn("credentials", {
            email: parsed.data.email,
            password: parsed.data.password,
            redirectTo: "/dashboard",
            redirect: false,
            ...(parsed.data.oauthQuery && {
                oauthQuery: parsed.data.oauthQuery,
            }),
        });
    } catch (error) {
        if (error instanceof InvalidCredentialsError) {
            return {
                ok: false,
                code: "invalid_credentials",
                message: t("invalidCredentials"),
            };
        }
        logAppEvent("auth.login_failed", failureAttributes(error));
        return { ok: false, code: "error", message: t("unexpected") };
    }
    return { ok: true, data: parsed.data.oauthQuery ? next : undefined };
}

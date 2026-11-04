"use server";

import { getTranslations } from "next-intl/server";

import { signIn, InvalidCredentialsError } from "@/auth";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import type { ActionResult, FieldErrors } from "@/lib/actions/result";
import { localizeFieldErrors } from "@/lib/actions/field-errors";
import { authMessages } from "./schema-messages";

/** Failure modes the login form can branch on. */
export type LoginCode = "validation" | "invalid_credentials" | "error";

export type LoginResult = ActionResult<void, LoginInput, LoginCode>;

/** Authenticate credentials and return a result without a redirect. */
export async function loginAction(input: unknown): Promise<LoginResult> {
    const t = await getTranslations("auth.errors");
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
            message: t("loginInvalid"),
            fieldErrors: localizeFieldErrors(fieldErrors, await authMessages()),
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
        if (error instanceof InvalidCredentialsError) {
            return {
                ok: false,
                code: "invalid_credentials",
                message: t("invalidCredentials"),
            };
        }
        return { ok: false, code: "error", message: t("unexpected") };
    }
    return { ok: true, data: undefined };
}

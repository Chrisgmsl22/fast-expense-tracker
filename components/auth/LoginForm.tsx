"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginResult } from "@/app/_actions/auth/login";
import type { FieldErrors } from "@/lib/actions/result";
import type { LoginInput } from "@/lib/schemas/auth";
import { withSessionLock } from "@/lib/auth/session-lock";
import {
    AUTH_ERROR_CLASS,
    AUTH_INPUT_CLASS,
    AUTH_LABEL_CLASS,
    AUTH_SUBMIT_CLASS,
} from "./auth-form-styles";
import { SessionExpiredNotice } from "./SessionExpiredNotice";

/** Submit credentials and navigate after the server confirms success. */
export function LoginForm({
    sessionExpired = false,
}: {
    sessionExpired?: boolean;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<LoginInput>>({});
    const [formError, setFormError] = useState<string | null>(null);

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const input = {
            email: String(fd.get("email") ?? ""),
            password: String(fd.get("password") ?? ""),
        };
        // Clear any prior error so it doesn't linger during the pending state.
        setErrors({});
        setFormError(null);
        startTransition(async () => {
            try {
                const res: LoginResult = await withSessionLock(() =>
                    loginAction(input),
                );
                if (res.ok) {
                    router.replace("/dashboard");
                } else {
                    setErrors(res.fieldErrors ?? {});
                    setFormError(res.message);
                }
            } catch {
                setFormError("Something went wrong. Please try again.");
            }
        });
    }

    const fieldError = (name: keyof LoginInput) => {
        const msg = errors[name]?.[0];
        return msg ? (
            <p className={`mt-1.5 ${AUTH_ERROR_CLASS}`} role="alert">
                {msg}
            </p>
        ) : null;
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex w-full flex-col gap-5"
            aria-label="Log in"
        >
            {sessionExpired && <SessionExpiredNotice />}
            <div>
                <Label htmlFor="email" className={AUTH_LABEL_CLASS}>
                    Email
                </Label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    className={AUTH_INPUT_CLASS}
                />
                {fieldError("email")}
            </div>

            <div>
                <Label htmlFor="password" className={AUTH_LABEL_CLASS}>
                    Password
                </Label>
                <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className={AUTH_INPUT_CLASS}
                />
                {fieldError("password")}
            </div>

            {formError && (
                <p className={AUTH_ERROR_CLASS} role="alert">
                    {formError}
                </p>
            )}

            <Button
                type="submit"
                disabled={pending}
                className={AUTH_SUBMIT_CLASS}
            >
                {pending ? "Signing in…" : "Sign in"}
            </Button>
        </form>
    );
}

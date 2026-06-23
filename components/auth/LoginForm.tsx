"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { loginAction, type LoginResult } from "@/app/_actions/auth/login";
import type { FieldErrors } from "@/lib/actions/result";
import type { LoginInput } from "@/lib/schemas/auth";

/**
 * Uncontrolled inputs read via FormData on submit; validation lives server-side
 * in `loginAction`. A successful login redirects server-side (the action never
 * returns), so a returned result is always a failure to surface.
 */
export function LoginForm() {
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
                const res: LoginResult = await loginAction(input);
                // Only failures return; success redirects before resolving.
                if (!res.ok) {
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
            <p className="mt-1 text-sm text-red-600" role="alert">
                {msg}
            </p>
        ) : null;
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-sm flex-col gap-4"
            aria-label="Log in"
        >
            <div>
                <label htmlFor="email" className="block text-sm font-medium">
                    Email
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    className="w-full rounded border p-2"
                />
                {fieldError("email")}
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium">
                    Password
                </label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded border p-2"
                />
                {fieldError("password")}
            </div>

            {formError && (
                <p className="text-sm text-red-600" role="alert">
                    {formError}
                </p>
            )}

            <Button type="submit" disabled={pending}>
                {pending ? "Signing in…" : "Sign in"}
            </Button>
        </form>
    );
}

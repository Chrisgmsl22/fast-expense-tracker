"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginResult } from "@/app/_actions/auth/login";
import type { FieldErrors } from "@/lib/actions/result";
import type { LoginInput } from "@/lib/schemas/auth";

/**
 * Uncontrolled inputs read via FormData on submit; validation lives server-side
 * in `loginAction`. A successful login redirects server-side (the action never
 * returns), so a returned result is always a failure to surface.
 *
 * The form renders once but appears on two surfaces: a dark column on mobile and
 * the white right panel on desktop (see the login page). The `md:` overrides
 * below re-theme the shared light primitives for the dark mobile surface.
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
            <p
                className="mt-1.5 text-sm text-red-400 md:text-destructive"
                role="alert"
            >
                {msg}
            </p>
        ) : null;
    };

    const labelClass = "text-white/70 md:text-foreground";
    const inputClass =
        "border-white/10 bg-white/5 text-white placeholder:text-white/30 " +
        "md:border-input md:bg-background md:text-foreground md:placeholder:text-muted-foreground";

    return (
        <form
            onSubmit={handleSubmit}
            className="flex w-full flex-col gap-5"
            aria-label="Log in"
        >
            <div>
                <Label htmlFor="email" className={labelClass}>
                    Email
                </Label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    className={`mt-2 ${inputClass}`}
                />
                {fieldError("email")}
            </div>

            <div>
                <Label htmlFor="password" className={labelClass}>
                    Password
                </Label>
                <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className={`mt-2 ${inputClass}`}
                />
                {fieldError("password")}
            </div>

            {formError && (
                <p
                    className="text-sm text-red-400 md:text-destructive"
                    role="alert"
                >
                    {formError}
                </p>
            )}

            <Button
                type="submit"
                disabled={pending}
                className="mt-1 h-11 w-full bg-white text-foreground hover:bg-white/90 md:bg-primary md:text-primary-foreground md:hover:bg-primary/90"
            >
                {pending ? "Signing in…" : "Sign in"}
            </Button>
        </form>
    );
}

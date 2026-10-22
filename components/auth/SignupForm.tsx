"use client";

import {
    useEffect,
    useRef,
    useState,
    useTransition,
    type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction, type SignupResult } from "@/app/_actions/auth/signup";
import type { FieldErrors } from "@/lib/actions/result";
import { withSessionLock } from "@/lib/auth/session-lock";
import type { SignupInput } from "@/lib/schemas/auth";
import {
    AUTH_ERROR_CLASS,
    AUTH_INPUT_CLASS,
    AUTH_LABEL_CLASS,
    AUTH_SUBMIT_CLASS,
} from "./auth-form-styles";
import { PasswordChecklist } from "./PasswordChecklist";
import { PasswordInput } from "./PasswordInput";

type Field = {
    name: keyof SignupInput;
    type: "text" | "email" | "password";
    autoComplete: string;
};

const FIELDS: readonly Field[] = [
    { name: "name", type: "text", autoComplete: "name" },
    { name: "email", type: "email", autoComplete: "email" },
    { name: "password", type: "password", autoComplete: "new-password" },
    { name: "confirmPassword", type: "password", autoComplete: "new-password" },
];

function firstInvalidField(
    errors: FieldErrors<SignupInput>,
): keyof SignupInput | undefined {
    return FIELDS.find(({ name }) => errors[name]?.length)?.name;
}

/** Create an account and navigate once the server has signed it in. */
export function SignupForm() {
    const t = useTranslations("auth");
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<SignupInput>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const formRef = useRef<HTMLFormElement>(null);

    // One live announcement per failed submit: the form summary, or, when a
    // failure has no summary, the first field message. Every other field message
    // is read through its input's aria-describedby when focus reaches it.
    const announcedField = formError ? undefined : firstInvalidField(errors);

    // Focus after commit, so the field already carries aria-invalid and its error.
    // Each failed submit sets a fresh errors object, so this runs once per failure.
    useEffect(() => {
        const firstInvalid = firstInvalidField(errors);
        if (!firstInvalid) return;
        const field = formRef.current?.elements.namedItem(firstInvalid);
        if (field instanceof HTMLInputElement) field.focus();
    }, [errors]);

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const input = Object.fromEntries(
            FIELDS.map(({ name }) => [name, String(fd.get(name) ?? "")]),
        );
        setErrors({});
        setFormError(null);
        startTransition(async () => {
            try {
                // Signing in writes the session cookie, which the idle guard also writes.
                const res: SignupResult = await withSessionLock(() =>
                    signupAction(input),
                );
                if (res.ok) {
                    router.replace("/dashboard");
                    return;
                }
                // Updates after an await leave the transition, so wrap them again:
                // the errors and pending=false then commit together.
                startTransition(() => {
                    setErrors({ ...res.fieldErrors });
                    // A message already shown on its field is not repeated at form level.
                    if (res.code !== "email_taken") setFormError(res.message);
                });
            } catch {
                startTransition(() => {
                    setFormError(t("errors.unexpected"));
                });
            }
        });
    }

    return (
        <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="flex w-full flex-col gap-5"
            aria-label={t("signup.formAria")}
            noValidate
        >
            {FIELDS.map(({ name, type, autoComplete }) => {
                const message = errors[name]?.[0];
                const errorId = `${name}-error`;
                const inputProps = {
                    id: name,
                    name,
                    autoComplete,
                    required: true,
                    "aria-invalid": message ? true : undefined,
                    "aria-describedby": message ? errorId : undefined,
                    className: AUTH_INPUT_CLASS,
                };
                return (
                    <div key={name}>
                        <Label htmlFor={name} className={AUTH_LABEL_CLASS}>
                            {t(`fields.${name}`)}
                        </Label>
                        {type === "password" ? (
                            <PasswordInput
                                {...inputProps}
                                toggleSubject={
                                    name === "confirmPassword"
                                        ? t(
                                              "passwordToggle.subjects.confirmPassword",
                                          )
                                        : t("passwordToggle.subjects.password")
                                }
                                onChange={
                                    name === "password"
                                        ? (e) => setPassword(e.target.value)
                                        : undefined
                                }
                            />
                        ) : (
                            <Input {...inputProps} type={type} />
                        )}
                        {message && (
                            <p
                                id={errorId}
                                className={`mt-1.5 ${AUTH_ERROR_CLASS}`}
                                role={
                                    name === announcedField
                                        ? "alert"
                                        : undefined
                                }
                            >
                                {message}
                            </p>
                        )}
                        {name === "password" && (
                            <PasswordChecklist password={password} />
                        )}
                    </div>
                );
            })}

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
                {pending ? t("signup.submitting") : t("signup.submit")}
            </Button>
        </form>
    );
}

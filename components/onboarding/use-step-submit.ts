"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ActionResult, FieldErrors } from "@/lib/actions/result";

const UNEXPECTED = "Something went wrong. Please try again.";

type Options = {
    /** Codes whose message already shows on a field, so it is not repeated for the form. */
    fieldOnlyCodes?: readonly string[];
};

/**
 * One save per step, with the signup form's error rules: field errors beside
 * their inputs, one announcement per failed submit, and focus on the first
 * invalid field. A successful save refreshes the page behind the wizard.
 * `fields` lists the inputs in screen order, by their `name`.
 */
export function useStepSubmit<TInput>(
    fields: readonly (keyof TInput & string)[],
    { fieldOnlyCodes = [] }: Options = {},
) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<TInput>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const firstInvalid = fields.find((field) => errors[field]?.length);
    const announcedField = formError ? undefined : firstInvalid;

    // Each failed submit sets a fresh errors object, so this runs once per failure.
    useEffect(() => {
        if (!firstInvalid) return;
        const field = formRef.current?.elements.namedItem(firstInvalid);
        if (field instanceof HTMLElement) field.focus();
    }, [errors, firstInvalid]);

    function submit<TData, TCode extends string>(
        run: () => Promise<ActionResult<TData, TInput, TCode>>,
        onOk: (data: TData) => void,
    ) {
        setErrors({});
        setFormError(null);
        startTransition(async () => {
            try {
                const res = await run();
                // Updates after an await leave the transition, so wrap them again.
                startTransition(() => {
                    if (res.ok) {
                        onOk(res.data);
                        router.refresh();
                        return;
                    }
                    setErrors({ ...res.fieldErrors });
                    if (!fieldOnlyCodes.includes(res.code)) {
                        setFormError(res.message);
                    }
                });
            } catch {
                startTransition(() => setFormError(UNEXPECTED));
            }
        });
    }

    function fieldError(field: keyof TInput & string): string | undefined {
        return errors[field]?.[0];
    }

    return {
        pending,
        formError,
        formRef,
        announcedField,
        fieldError,
        submit,
    };
}

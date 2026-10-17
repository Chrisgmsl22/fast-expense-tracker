"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ActionResult, FieldErrors } from "@/lib/actions/result";

const UNEXPECTED = "Something went wrong. Please try again.";

type Options = {
    /** Codes whose message already shows on a field, so it is not repeated for the form. */
    fieldOnlyCodes?: readonly string[];
};

/** Fixed when a submit fails, so later edits never move focus or re-announce. */
type Failure<TField> = {
    focus?: TField;
    announce?: TField;
};

/**
 * One save per step, with the signup form's error rules: field errors beside
 * their inputs, one announcement per failed submit, and focus on the first
 * invalid field. Editing a field clears its error and the form error. A
 * successful save refreshes the page behind the wizard.
 * `fields` lists the inputs in screen order, by their `name`.
 */
export function useStepSubmit<TInput>(
    fields: readonly (keyof TInput & string)[],
    { fieldOnlyCodes = [] }: Options = {},
) {
    type Field = keyof TInput & string;

    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [errors, setErrors] = useState<FieldErrors<TInput>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [failure, setFailure] = useState<Failure<Field> | null>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const announcedField =
        failure?.announce && errors[failure.announce]?.length
            ? failure.announce
            : undefined;

    // Each failed submit sets a fresh failure object, so this runs once per failure.
    useEffect(() => {
        if (!failure?.focus) return;
        const field = formRef.current?.elements.namedItem(failure.focus);
        if (field instanceof HTMLElement) field.focus();
    }, [failure]);

    function submit<TData, TCode extends string>(
        run: () => Promise<ActionResult<TData, TInput, TCode>>,
        onOk: (data: TData) => void,
    ) {
        setErrors({});
        setFormError(null);
        setFailure(null);
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
                    const fieldErrors: FieldErrors<TInput> = {
                        ...res.fieldErrors,
                    };
                    const showsFormError = !fieldOnlyCodes.includes(res.code);
                    const first = fields.find(
                        (field) => fieldErrors[field]?.length,
                    );
                    setErrors(fieldErrors);
                    setFormError(showsFormError ? res.message : null);
                    setFailure({
                        focus: first,
                        announce: showsFormError ? undefined : first,
                    });
                });
            } catch {
                startTransition(() => setFormError(UNEXPECTED));
            }
        });
    }

    /** Call from a field's change handler: its error and the form error are now stale. */
    function edited(field: Field) {
        setFormError(null);
        setErrors((prev) =>
            prev[field] ? { ...prev, [field]: undefined } : prev,
        );
    }

    function fieldError(field: Field): string | undefined {
        return errors[field]?.[0];
    }

    return {
        pending,
        formError,
        formRef,
        announcedField,
        fieldError,
        edited,
        submit,
    };
}

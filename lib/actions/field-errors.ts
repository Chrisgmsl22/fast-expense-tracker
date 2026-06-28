import type { ZodError } from "zod";

import type { FieldErrors } from "@/lib/actions/result";

/**
 * Map a `ZodError` onto the typed `FieldErrors` shape — first path segment is
 * the field, messages accumulate under it. Extracted so every action builds
 * field errors identically instead of re-implementing the loop (it was
 * copy-pasted across create + update).
 */
export function toFieldErrors<TInput>(error: ZodError): FieldErrors<TInput> {
    const fieldErrors: FieldErrors<TInput> = {};
    for (const issue of error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") {
            const field = key as keyof TInput;
            (fieldErrors[field] ??= []).push(issue.message);
        }
    }
    return fieldErrors;
}

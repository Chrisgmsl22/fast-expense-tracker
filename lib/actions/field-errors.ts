import type { ZodError } from "zod";

import type { FieldErrors } from "@/lib/actions/result";

export type FieldIssue = ZodError["issues"][number];

/**
 * Map a `ZodError` onto the typed `FieldErrors` shape — first path segment is
 * the field, messages accumulate under it. `messageOf` picks each issue's text;
 * by default it is the schema's own message.
 */
export function toFieldErrors<TInput>(
    error: ZodError,
    messageOf: (issue: FieldIssue, field: keyof TInput & string) => string = (
        issue,
    ) => issue.message,
): FieldErrors<TInput> {
    const fieldErrors: FieldErrors<TInput> = {};
    for (const issue of error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") {
            const field = key as keyof TInput & string;
            (fieldErrors[field] ??= []).push(messageOf(issue, field));
        }
    }
    return fieldErrors;
}

/** English text from a shared schema or domain module → the same text in the active locale. */
export type Translations = Readonly<Record<string, string>>;

// Shared schemas keep their English messages, so actions translate at their own
// boundary. Text with no entry (a zod default, say) passes through unchanged.
export function localizeMessage(
    message: string,
    translations: Translations,
): string {
    const translated = Object.hasOwn(translations, message)
        ? translations[message]
        : undefined;
    return translated ?? message;
}

export function localizeFieldErrors<TInput>(
    fieldErrors: FieldErrors<TInput>,
    translations: Translations,
): FieldErrors<TInput> {
    const localized: FieldErrors<TInput> = {};
    for (const field of Object.keys(fieldErrors) as (keyof TInput)[]) {
        const messages = fieldErrors[field];
        if (messages) {
            localized[field] = messages.map((message) =>
                localizeMessage(message, translations),
            );
        }
    }
    return localized;
}

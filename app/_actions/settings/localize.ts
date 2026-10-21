import type { FieldErrors } from "@/lib/actions/result";

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

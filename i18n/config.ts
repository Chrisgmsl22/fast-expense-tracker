export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const TIME_ZONE = "America/Mexico_City";

/** Each language names itself, whatever the active locale, so these are data and not messages. */
export const LOCALE_NAMES: Record<Locale, string> = {
    es: "Español",
    en: "English",
};

export function isLocale(value: unknown): value is Locale {
    return LOCALES.some((locale) => locale === value);
}

export function resolveLocale(value: string | null | undefined): Locale {
    return isLocale(value) ? value : DEFAULT_LOCALE;
}

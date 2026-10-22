import { describe, expect, it, vi } from "vitest";

const { cookieValue } = vi.hoisted(() => ({
    cookieValue: { current: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
    cookies: async () => ({
        get: (name: string) =>
            name === "NEXT_LOCALE" && cookieValue.current !== undefined
                ? { name, value: cookieValue.current }
                : undefined,
    }),
}));

import {
    DEFAULT_LOCALE,
    LOCALES,
    isLocale,
    resolveLocale,
} from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import requestConfig from "@/i18n/request";

describe("locale config", () => {
    it("Should support Spanish and English, with Spanish as the default", () => {
        expect(LOCALES).toEqual(["es", "en"]);
        expect(DEFAULT_LOCALE).toBe("es");
    });

    it.each([
        ["es", true],
        ["en", true],
        ["fr", false],
        ["EN", false],
        ["", false],
        [undefined, false],
        [null, false],
        [42, false],
    ])("Should report %s as a locale: %s", (value, expected) => {
        expect(isLocale(value)).toBe(expected);
    });

    it.each([
        [undefined, "es"],
        [null, "es"],
        ["", "es"],
        ["fr", "es"],
        ["es-MX", "es"],
        ["es", "es"],
        ["en", "en"],
    ] as const)("Should resolve %s to %s", (value, expected) => {
        expect(resolveLocale(value)).toBe(expected);
    });
});

describe("i18n/request", () => {
    const params = { requestLocale: Promise.resolve(undefined) };

    it.each([
        ["missing", undefined, "es"],
        ["unknown", "fr", "es"],
        ["Spanish", "es", "es"],
        ["English", "en", "en"],
    ] as const)(
        "Should load the right messages when the cookie is %s",
        async (_case, cookie, locale) => {
            cookieValue.current = cookie;
            const config = await requestConfig(params);
            expect(config.locale).toBe(locale);
            expect(config.messages).toBe(MESSAGES[locale]);
            expect(config.timeZone).toBe("America/Mexico_City");
        },
    );
});

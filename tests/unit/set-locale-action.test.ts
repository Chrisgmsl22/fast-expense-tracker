import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setCookie } = vi.hoisted(() => ({ setCookie: vi.fn() }));

vi.mock("next/headers", () => ({
    cookies: async () => ({ set: setCookie }),
}));

import { setLocale } from "@/app/_actions/locale/set-locale";
import { setServerLocale } from "@/tests/support/intl";

const ONE_YEAR_SECONDS = 31_536_000;

beforeEach(() => setCookie.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("setLocale", () => {
    it.each(["es", "en"] as const)(
        "Should write the %s cookie and return it",
        async (locale) => {
            const res = await setLocale({ locale });

            expect(res).toEqual({ ok: true, data: { locale } });
            expect(setCookie).toHaveBeenCalledTimes(1);
            expect(setCookie).toHaveBeenCalledWith("NEXT_LOCALE", locale, {
                path: "/",
                maxAge: ONE_YEAR_SECONDS,
                sameSite: "lax",
                httpOnly: true,
                secure: false,
            });
        },
    );

    it("Should mark the cookie secure in production", async () => {
        vi.stubEnv("NODE_ENV", "production");

        await setLocale({ locale: "en" });

        expect(setCookie).toHaveBeenCalledWith(
            "NEXT_LOCALE",
            "en",
            expect.objectContaining({ secure: true }),
        );
    });

    it.each([
        ["an unknown locale", { locale: "fr" }],
        ["a region tag", { locale: "es-MX" }],
        ["a bare string", "es"],
        ["no input", undefined],
    ])(
        "Should refuse %s with a typed failure and write nothing",
        async (_case, input) => {
            const res = await setLocale(input);

            expect(res).toEqual({
                ok: false,
                code: "invalid_locale",
                message: "Choose Español or English.",
            });
            expect(setCookie).not.toHaveBeenCalled();
        },
    );

    it("Should word the failure in the active locale", async () => {
        setServerLocale("es");

        const res = await setLocale({ locale: "fr" });

        expect(res).toMatchObject({
            ok: false,
            code: "invalid_locale",
            message: "Elige Español o English.",
        });
    });
});

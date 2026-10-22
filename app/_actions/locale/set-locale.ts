"use server";

import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { LOCALE_COOKIE, type Locale } from "@/i18n/config";
import type { ActionResult } from "@/lib/actions/result";
import {
    setLocaleInputSchema,
    type SetLocaleInput,
} from "@/lib/schemas/locale";

export type SetLocaleCode = "invalid_locale";

export type SetLocaleResult = ActionResult<
    { locale: Locale },
    SetLocaleInput,
    SetLocaleCode
>;

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setLocale(input: unknown): Promise<SetLocaleResult> {
    const parsed = setLocaleInputSchema.safeParse(input);
    if (!parsed.success) {
        const t = await getTranslations("common.language");
        return { ok: false, code: "invalid_locale", message: t("invalid") };
    }

    const { locale } = parsed.data;
    (await cookies()).set(LOCALE_COOKIE, locale, {
        path: "/",
        maxAge: ONE_YEAR_SECONDS,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    });
    return { ok: true, data: { locale } };
}

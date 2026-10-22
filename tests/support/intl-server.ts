import {
    createFormatter,
    createTranslator,
    type AbstractIntlMessages,
} from "next-intl";

import { TIME_ZONE, type Locale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";

let serverLocale: Locale = "en";

export function setServerLocale(locale: Locale): void {
    serverLocale = locale;
}

type TranslationsArg = string | { locale?: Locale; namespace?: string };

/** Stands in for `next-intl/server`, which only runs inside a Next request. */
export const nextIntlServerMock = {
    getLocale: async () => serverLocale,
    getMessages: async () => MESSAGES[serverLocale],
    getTimeZone: async () => TIME_ZONE,
    getNow: async () => new Date(),
    getFormatter: async () =>
        createFormatter({ locale: serverLocale, timeZone: TIME_ZONE }),
    getTranslations: async (arg?: TranslationsArg) => {
        const opts = typeof arg === "string" ? { namespace: arg } : arg;
        const locale = opts?.locale ?? serverLocale;
        const messages: AbstractIntlMessages = MESSAGES[locale];
        return createTranslator({
            locale,
            messages,
            namespace: opts?.namespace,
            timeZone: TIME_ZONE,
        });
    },
    getRequestConfig: <T>(createConfig: T) => createConfig,
    setRequestLocale: () => {},
};

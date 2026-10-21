// Intl helpers for unit tests. English is the default, so English assertions hold.
// - Components (client, or server without `async`): renderWithIntl(<X />, { locale: "es" }).
// - Async server components and server actions: `next-intl/server` is mocked for every
//   unit and integration file (tests/support/intl-setup.ts) with the real messages.
//   Call setServerLocale("es") to switch; it resets to "en" after each test.
import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { TIME_ZONE, type Locale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { setServerLocale } from "./intl-server";

export { setServerLocale };

export function renderWithIntl(
    ui: ReactElement,
    { locale = "en", ...options }: RenderOptions & { locale?: Locale } = {},
) {
    setServerLocale(locale);
    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <NextIntlClientProvider
                locale={locale}
                messages={MESSAGES[locale]}
                timeZone={TIME_ZONE}
            >
                {children}
            </NextIntlClientProvider>
        );
    }
    return render(ui, { wrapper: Wrapper, ...options });
}

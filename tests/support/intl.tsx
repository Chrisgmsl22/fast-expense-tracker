// English by default, so English assertions hold. Components: renderWithIntl(<X />, { locale: "es" }).
// Async server components and actions: intl-setup.ts mocks `next-intl/server` with the real
// messages for every test file; setServerLocale("es") switches it until the test ends.
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

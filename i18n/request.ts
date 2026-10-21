import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { LOCALE_COOKIE, TIME_ZONE, resolveLocale } from "./config";
import { MESSAGES } from "./messages";

export default getRequestConfig(async () => {
    const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
    return { locale, messages: MESSAGES[locale], timeZone: TIME_ZONE };
});

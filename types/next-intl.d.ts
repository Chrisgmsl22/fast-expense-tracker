import type { Locale as AppLocale } from "@/i18n/config";
import type { Messages as AppMessages } from "@/i18n/messages";

// Typed keys: `t("nav.typo")` fails to compile instead of rendering the key.
declare module "next-intl" {
    interface AppConfig {
        Locale: AppLocale;
        Messages: AppMessages;
    }
}

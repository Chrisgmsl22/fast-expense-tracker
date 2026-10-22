import { getTranslations } from "next-intl/server";

import type { Translations } from "@/lib/actions/field-errors";
import { NAME_MAX_LENGTH } from "@/lib/schemas/auth";

// Keys are the English messages in lib/schemas/auth.ts, lib/account/display-name.ts
// and lib/onboarding/finish-onboarding.ts, which return English for logs and tests.
export async function accountMessages(): Promise<Translations> {
    const t = await getTranslations("onboarding.errors");
    const auth = await getTranslations("auth.errors");
    const settings = await getTranslations("settings.errors");
    return {
        "Name is required": auth("nameRequired"),
        [`Name must be ${NAME_MAX_LENGTH} characters or fewer`]: auth(
            "nameTooLong",
            { max: NAME_MAX_LENGTH },
        ),
        "Check the highlighted field.": t("checkField"),
        "Not authenticated": settings("unauthenticated"),
        "Could not save your name. Please try again.": t("nameSaveFailed"),
        "Could not finish setup. Please try again.": t("finishFailed"),
    };
}

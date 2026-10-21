import { getTranslations } from "next-intl/server";

import type { Translations } from "@/app/_actions/settings/localize";
import {
    PASSWORD_MAX_BYTES,
    PASSWORD_MIN_LENGTH,
    PASSWORD_RULES,
} from "@/lib/domain/password-rules";
import { NAME_MAX_LENGTH } from "@/lib/schemas/auth";

// Keys are the English messages in lib/schemas/auth.ts, lib/domain/password-rules.ts
// and lib/auth/signup.ts, which return English for logs and tests.
export async function authMessages(): Promise<Translations> {
    const t = await getTranslations("auth.errors");
    const passwordRules = Object.fromEntries(
        PASSWORD_RULES.map((rule) => [
            rule.message,
            t(`passwordRules.${rule.id}`, { min: PASSWORD_MIN_LENGTH }),
        ]),
    );
    return {
        ...passwordRules,
        "Email is required": t("emailRequired"),
        "Enter a valid email": t("emailInvalid"),
        "Password is required": t("passwordRequired"),
        "Name is required": t("nameRequired"),
        [`Name must be ${NAME_MAX_LENGTH} characters or fewer`]: t(
            "nameTooLong",
            { max: NAME_MAX_LENGTH },
        ),
        "Confirm your password": t("confirmRequired"),
        "Passwords do not match": t("passwordsMismatch"),
        [`Password must be ${PASSWORD_MAX_BYTES} characters or fewer`]: t(
            "passwordMaxChars",
            { max: PASSWORD_MAX_BYTES },
        ),
        "Password is too long. Use fewer accented letters or symbols.":
            t("passwordTooLong"),
        "Check the highlighted fields.": t("signupValidation"),
        "Sign-ups are closed right now.": t("signupClosed"),
        "Sign-ups are currently full.": t("signupFull"),
        "An account with this email already exists.": t("emailTaken"),
        "Something went wrong. Please try again.": t("unexpected"),
        "Your account is ready, but signing in failed. Please log in.":
            t("signInFailed"),
    };
}

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt ignores every byte past the 72nd, so a longer password would match its own prefix. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordRuleId =
    | "length"
    | "uppercase"
    | "lowercase"
    | "number"
    | "special";

export type PasswordRule = {
    id: PasswordRuleId;
    /** Checklist wording. */
    label: string;
    /** Field error when this is the first rule the password misses. */
    message: string;
    test: (password: string) => boolean;
};

/**
 * The signup password rules, in checklist order. Letters and digits follow
 * Unicode, so "Ñ" is an uppercase letter. Anything that is not a letter, an
 * accent mark or a digit is special, a space included.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
    {
        id: "length",
        label: `At least ${PASSWORD_MIN_LENGTH} characters`,
        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        test: (password) => Array.from(password).length >= PASSWORD_MIN_LENGTH,
    },
    {
        id: "uppercase",
        label: "One uppercase letter",
        message: "Password must include an uppercase letter",
        test: (password) => /\p{Lu}/u.test(password),
    },
    {
        id: "lowercase",
        label: "One lowercase letter",
        message: "Password must include a lowercase letter",
        test: (password) => /\p{Ll}/u.test(password),
    },
    {
        id: "number",
        label: "One number",
        message: "Password must include a number",
        test: (password) => /\p{Nd}/u.test(password),
    },
    {
        id: "special",
        label: "One special character, like ! or #",
        message: "Password must include a special character",
        test: (password) => /[^\p{L}\p{M}\p{Nd}]/u.test(password),
    },
];

export type PasswordRuleStatus = { rule: PasswordRule; met: boolean };

export function passwordRuleStatuses(password: string): PasswordRuleStatus[] {
    return PASSWORD_RULES.map((rule) => ({ rule, met: rule.test(password) }));
}

export type PasswordStrength = "weak" | "fair" | "strong";

export function passwordStrength(password: string): PasswordStrength {
    const met = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
    if (met === PASSWORD_RULES.length) return "strong";
    return met >= 3 ? "fair" : "weak";
}

const utf8 = new TextEncoder();

/** The message for the first rule the password misses, then the bcrypt limit; `undefined` when it passes. */
export function firstPasswordProblem(password: string): string | undefined {
    const unmet = PASSWORD_RULES.find((rule) => !rule.test(password));
    if (unmet) return unmet.message;
    if (password.length > PASSWORD_MAX_BYTES) {
        return `Password must be ${PASSWORD_MAX_BYTES} characters or fewer`;
    }
    if (utf8.encode(password).length > PASSWORD_MAX_BYTES) {
        return "Password is too long. Use fewer accented letters or symbols.";
    }
    return undefined;
}

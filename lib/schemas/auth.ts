import { z } from "zod";

import { normalizeEmail } from "@/lib/domain/user";

/**
 * Emails are case-insensitive: the schema trims and lowercases them, the same
 * rule every stored email follows.
 */
const emailField = z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email")
    .transform(normalizeEmail);

/** Password is only checked for presence; the real check is `bcrypt.compare` in `verifyCredentials`. */
export const loginSchema = z.object({
    email: emailField,
    password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt ignores every byte past the 72nd, so a longer password would match its own prefix. */
export const PASSWORD_MAX_BYTES = 72;

const utf8 = new TextEncoder();

const nameField = z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(
        NAME_MAX_LENGTH,
        `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
    );

export const displayNameSchema = z.object({ name: nameField });

export type DisplayNameInput = z.infer<typeof displayNameSchema>;

export const signupSchema = z
    .object({
        name: nameField,
        email: emailField,
        password: z
            .string()
            .min(
                PASSWORD_MIN_LENGTH,
                `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
            )
            .max(
                PASSWORD_MAX_BYTES,
                `Password must be ${PASSWORD_MAX_BYTES} characters or fewer`,
            )
            .refine(
                (password) =>
                    utf8.encode(password).length <= PASSWORD_MAX_BYTES,
                "Password is too long. Use fewer accented letters or symbols.",
            ),
        confirmPassword: z.string().min(1, "Confirm your password"),
    })
    .refine((input) => input.password === input.confirmPassword, {
        path: ["confirmPassword"],
        message: "Passwords do not match",
    });

export type SignupInput = z.infer<typeof signupSchema>;

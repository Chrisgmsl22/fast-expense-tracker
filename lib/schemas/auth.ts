import { z } from "zod";

import { firstPasswordProblem } from "@/lib/domain/password-rules";
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

export const signupSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, "Name is required")
            .max(
                NAME_MAX_LENGTH,
                `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
            ),
        email: emailField,
        password: z.string().superRefine((password, ctx) => {
            const problem = firstPasswordProblem(password);
            if (problem) ctx.addIssue({ code: "custom", message: problem });
        }),
        confirmPassword: z.string().min(1, "Confirm your password"),
    })
    .refine((input) => input.password === input.confirmPassword, {
        path: ["confirmPassword"],
        message: "Passwords do not match",
    });

export type SignupInput = z.infer<typeof signupSchema>;

import { z } from "zod";

import { normalizeEmail } from "@/lib/domain/user";

/**
 * Emails are case-insensitive: the schema trims and lowercases them, the same
 * rule every stored email follows. Password is only checked for presence; the
 * real check is `bcrypt.compare` in `verifyCredentials`.
 */
export const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .min(1, "Email is required")
        .email("Enter a valid email")
        .transform(normalizeEmail),
    password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

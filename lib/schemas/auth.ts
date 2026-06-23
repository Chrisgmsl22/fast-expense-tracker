import { z } from "zod";

/**
 * Validation for the credentials login form (slice 1.3).
 *
 * Email is trimmed only — NOT lowercased. The seed stores `ADMIN_EMAIL`
 * verbatim (`prisma/seed.ts`), and `verifyCredentials` does an exact
 * `findUnique`, so lowercasing here would make a mixed-case seeded email
 * impossible to match. Trim guards against trailing whitespace; the email
 * comparison is otherwise case-sensitive by design (matches what was seeded).
 * Password is only checked for presence — the real check is `bcrypt.compare`
 * in `verifyCredentials`; strength rules belong to the seed/setup step.
 */
export const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .min(1, "Email is required")
        .email("Enter a valid email"),
    password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

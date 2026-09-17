import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { loginSchema } from "@/lib/schemas/auth";
import { verifyCredentials } from "@/lib/services/user/user.service";

/**
 * Extends the shared `authConfig` (which owns every callback and the session
 * strategy/window) with the Credentials provider. The Credentials provider has
 * no database-session support in Auth.js v5, so there is no `PrismaAdapter`
 * and the strategy is JWT, set in `auth.config.ts`.
 *
 * `authorize` returns the user on a match and `null` otherwise; Auth.js turns
 * the `null` into a `CredentialsSignin` error that the login action catches.
 *
 * Exported so a unit test can assert the composed config.
 */
export const authOptions = {
    ...authConfig,
    providers: [
        Credentials({
            credentials: {
                email: {},
                password: {},
            },
            authorize: async (credentials) => {
                const parsed = loginSchema.safeParse(credentials);
                if (!parsed.success) {
                    return null;
                }
                return verifyCredentials(
                    parsed.data.email,
                    parsed.data.password,
                );
            },
        }),
    ],
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);

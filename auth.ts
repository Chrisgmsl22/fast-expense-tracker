import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { loginSchema } from "@/lib/schemas/auth";
import { verifyCredentials } from "@/lib/services/user/user.service";

/**
 * Full Auth.js instance.
 *
 * Extends the shared `authConfig` (which owns every callback) with the
 * Credentials provider and the JWT session strategy. The Credentials provider
 * has no database-session support in Auth.js v5, so there is no `PrismaAdapter`
 * and the strategy is JWT.
 *
 * `authorize` returns the user on a match and `null` otherwise; Auth.js turns
 * the `null` into a `CredentialsSignin` error that the login action catches.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    session: { strategy: "jwt" },
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
});

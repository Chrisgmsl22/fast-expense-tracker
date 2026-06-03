import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

/**
 * Full Auth.js instance.
 *
 * Extends the shared `authConfig` with the provider list and session settings.
 * Slice 1.3 attaches the Credentials provider (with password hashing) and the
 * DB-backed user lookup here.
 *
 * Session strategy is JWT: the Credentials provider has no database-session
 * support in Auth.js v5, so there is no `PrismaAdapter` in v1.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    session: { strategy: "jwt" },
});

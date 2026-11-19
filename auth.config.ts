import { randomUUID } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import bcrypt from "bcryptjs";
import { IDLE_TIMEOUT_MS, IDLE_TIMEOUT_SECONDS } from "@/lib/auth/idle-session";

export const authConfig = {
    secret: process.env.AUTH_SECRET,
    baseURL: process.env.AUTH_URL,
    user: { modelName: "User" },
    account: { modelName: "Account" },
    verification: { modelName: "Verification" },
    emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        minPasswordLength: 1,
        password: {
            hash: (password) => bcrypt.hash(password, 10),
            verify: ({ hash, password }) => bcrypt.compare(password, hash),
        },
    },
    session: {
        modelName: "Session",
        expiresIn: IDLE_TIMEOUT_SECONDS,
        disableSessionRefresh: true,
        cookieCache: { enabled: false },
    },
    databaseHooks: {
        session: {
            create: {
                before: async (session) => ({
                    data: {
                        ...session,
                        // Better Auth gives rememberMe:false a separate 24-hour lifetime.
                        expiresAt: new Date(
                            Math.min(
                                session.expiresAt.getTime(),
                                Date.now() + IDLE_TIMEOUT_MS,
                            ),
                        ),
                    },
                }),
            },
        },
    },
    advanced: { database: { generateId: () => randomUUID() } },
    rateLimit: { enabled: true, storage: "database", modelName: "RateLimit" },
    disabledPaths: [
        "/sign-up/email",
        "/change-password",
        "/set-password",
        "/reset-password",
        "/request-password-reset",
        "/change-email",
        "/delete-user",
        "/update-user",
    ],
} satisfies BetterAuthOptions;

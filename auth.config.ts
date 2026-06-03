import type { NextAuthConfig } from "next-auth";

/**
 * Shared Auth.js base config.
 *
 * Holds provider-independent settings (`pages`, the `authorized` route-gate
 * callback) so `auth.ts` and any consumer compose from one source. Kept
 * separate from `auth.ts` for organization; under Next.js 16 the proxy runs on
 * the Node runtime (ADR-0007), so this no longer needs to be Edge-safe.
 *
 * Scaffold only (slice 1.1): no providers and no real authorization logic
 * yet. The Credentials provider, login flow, and the route whitelist/block
 * land in slice 1.3.
 */
export const authConfig = {
    pages: {
        signIn: "/login",
    },
    providers: [], // Credentials provider added in slice 1.3
    callbacks: {
        // No enforcement yet — returning true leaves every route open so the
        // app isn't locked before the login flow exists. Slice 1.3 replaces
        // this with the real whitelist (/login, /api/auth/*) + block.
        authorized() {
            return true;
        },
    },
} satisfies NextAuthConfig;

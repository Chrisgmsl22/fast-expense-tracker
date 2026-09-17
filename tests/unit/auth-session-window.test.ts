// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// `next-auth` (and the Credentials provider) pull in `next/server`, which is
// unresolvable under Vitest — stub both so `auth.ts` loads for real below.
// `verifyCredentials` pulls in `@/lib/db` (Prisma); stub it too.
vi.mock("next-auth", () => ({
    default: vi.fn(() => ({
        handlers: {},
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
    })),
}));
vi.mock("next-auth/providers/credentials", () => ({
    default: vi.fn(() => ({})),
}));
vi.mock("@/lib/services/user/user.service", () => ({
    verifyCredentials: vi.fn(),
}));

import NextAuth, { type NextAuthConfig } from "next-auth";

import { authOptions } from "@/auth";

/**
 * Asserts the composed `authOptions` passed to `NextAuth(...)` in `auth.ts` —
 * a second `session` key there would shallow-override `authConfig`'s, and
 * only the composed object catches that.
 */
describe("authOptions.session", () => {
    it("expires after a 7-day rolling window, refreshed once a day", () => {
        expect(authOptions.session.strategy).toBe("jwt");
        expect(authOptions.session.maxAge).toBe(7 * 24 * 60 * 60);
        expect(authOptions.session.updateAge).toBe(24 * 60 * 60);
    });

    // Guards against a second `session` key at the `NextAuth(...)` call site
    // itself, not just on the exported `authOptions` object.
    it("passes the same session window to the NextAuth(...) call", () => {
        const passedConfig = vi.mocked(NextAuth).mock.calls[0]?.[0] as
            | NextAuthConfig
            | undefined;
        expect(passedConfig?.session?.strategy).toBe("jwt");
        expect(passedConfig?.session?.maxAge).toBe(7 * 24 * 60 * 60);
        expect(passedConfig?.session?.updateAge).toBe(24 * 60 * 60);
    });
});

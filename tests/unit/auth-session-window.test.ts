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

/** Asserts the composed object — a second `session` key in `auth.ts`
 * would shallow-override `authConfig`'s. */
describe("authOptions.session", () => {
    it("Should retain the JWT session configuration when authOptions composes the shared config", () => {
        expect(authOptions.session.strategy).toBe("jwt");
        expect(authOptions.session.maxAge).toBe(7 * 24 * 60 * 60);
        expect(authOptions.session.updateAge).toBe(24 * 60 * 60);
    });

    // Guards against a second `session` key at the `NextAuth(...)` call site
    // itself, not just on the exported `authOptions` object.
    it("Should pass the same session configuration when NextAuth receives authOptions", () => {
        const passedConfig = vi.mocked(NextAuth).mock.calls[0]?.[0] as
            | NextAuthConfig
            | undefined;
        expect(passedConfig?.session?.strategy).toBe("jwt");
        expect(passedConfig?.session?.maxAge).toBe(7 * 24 * 60 * 60);
        expect(passedConfig?.session?.updateAge).toBe(24 * 60 * 60);
    });
});

// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

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
        expect(authOptions.session.maxAge).toBe(30 * 60);
    });

    // Guards against a second `session` key at the `NextAuth(...)` call site
    // itself, not just on the exported `authOptions` object.
    it("Should pass the same session configuration when NextAuth receives authOptions", () => {
        const passedConfig = vi.mocked(NextAuth).mock.calls[0]?.[0] as
            | NextAuthConfig
            | undefined;
        expect(passedConfig?.session?.strategy).toBe("jwt");
        expect(passedConfig?.session?.maxAge).toBe(30 * 60);
    });
});

const NOW = Date.UTC(2026, 8, 18, 12);
const WINDOW = 30 * 60 * 1000;
type JwtCallback = NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>;
const jwtCallback: JwtCallback = authOptions.callbacks.jwt;
const validToken = () => ({
    sub: "invented-user",
    idleExpiresAt: NOW + WINDOW,
    idleSessionId: "invented-session",
});
const callJwt = (args: Partial<Parameters<JwtCallback>[0]>) =>
    jwtCallback({ token: validToken(), ...args } as Parameters<JwtCallback>[0]);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("idle deadline callbacks", () => {
    it("Should start the idle window when credentials identify a user", async () => {
        const token = await callJwt({
            token: {},
            user: { id: "invented-user" },
            trigger: "signIn",
        });
        expect(token).toMatchObject({
            sub: "invented-user",
            idleExpiresAt: NOW + WINDOW,
        });
        expect(token?.idleSessionId).toEqual(expect.any(String));
    });
    it("Should preserve the deadline when a passive session read occurs", async () => {
        vi.setSystemTime(NOW + 60_000);
        expect(await callJwt({})).toEqual(validToken());
    });
    it.each([WINDOW, WINDOW + 1])(
        "Should reject the token when the deadline passes (%i)",
        async (elapsed) => {
            vi.setSystemTime(NOW + elapsed);
            expect(await callJwt({})).toBeNull();
        },
    );
    it("Should reject prior tokens when idle claims are absent", async () => {
        expect(await callJwt({ token: { sub: "invented-user" } })).toBeNull();
    });
    it("Should retain identity when authenticated activity renews the window", async () => {
        vi.setSystemTime(NOW + 60_000);
        const token = await callJwt({
            trigger: "update",
            session: {
                idleActivity: true,
                idleSessionId: "invented-session",
                idleForMs: 5_000,
                sub: "attacker",
                idleExpiresAt: Infinity,
            },
        });
        expect(token).toEqual({
            ...validToken(),
            idleExpiresAt: NOW + 55_000 + WINDOW,
        });
    });
    it("Should reject late activity when the idle deadline expires", async () => {
        vi.setSystemTime(NOW + WINDOW);
        expect(
            await callJwt({
                trigger: "update",
                session: {
                    idleActivity: true,
                    idleSessionId: "invented-session",
                    idleForMs: 0,
                },
            }),
        ).toBeNull();
    });
    it.each([-1, Infinity, NaN, WINDOW, "0", null])(
        "Should preserve the deadline when activity input is invalid (%s)",
        async (idleForMs) => {
            vi.setSystemTime(NOW + 60_000);
            expect(
                await callJwt({
                    trigger: "update",
                    session: {
                        idleActivity: true,
                        idleSessionId: "invented-session",
                        idleForMs,
                    },
                }),
            ).toEqual(validToken());
        },
    );
    it("Should preserve the deadline when an update lacks real activity", async () => {
        vi.setSystemTime(NOW + 60_000);
        expect(await callJwt({ trigger: "update", session: {} })).toEqual(
            validToken(),
        );
    });
    it("Should expose the authoritative deadline when a valid session forms", () => {
        const session = authOptions.callbacks.session({
            session: {
                user: { id: "", name: "Invented" },
                expires: "2099-01-01",
            },
            token: validToken(),
        } as Parameters<typeof authOptions.callbacks.session>[0]);
        expect(session).toMatchObject({
            user: { id: "invented-user", name: "Invented" },
            idleExpiresAt: NOW + WINDOW,
            idleSessionId: "invented-session",
            expires: new Date(NOW + WINDOW).toISOString(),
        });
    });
});

it("Should ignore activity from a prior login in another tab", async () => {
    vi.setSystemTime(NOW + 60_000);
    expect(
        await callJwt({
            trigger: "update",
            session: {
                idleActivity: true,
                idleSessionId: "old-session",
                idleForMs: 0,
            },
        }),
    ).toEqual(validToken());
});

it("Should preserve a newer deadline when an old activity event arrives", async () => {
    vi.setSystemTime(NOW + 60_000);
    expect(
        await callJwt({
            trigger: "update",
            session: {
                idleActivity: true,
                idleSessionId: "invented-session",
                idleForMs: 120_000,
            },
        }),
    ).toEqual(validToken());
});

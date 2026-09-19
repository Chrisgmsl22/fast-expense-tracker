// @vitest-environment node
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { encode, decode } from "next-auth/jwt";
import { authConfig } from "@/auth.config";
import { passiveSessionResponse } from "@/lib/auth/passive-session-response";

const require = createRequire(import.meta.url);
const corePath = require.resolve("@auth/core", {
    paths: [dirname(require.resolve("next-auth"))],
});
const authCore: {
    Auth: (request: Request, config: NextAuthConfig) => Promise<Response>;
    skipCSRFCheck: NonNullable<NextAuthConfig["skipCSRFCheck"]>;
} = await import(corePath);
const NOW = Date.UTC(2026, 8, 18, 12);
const SECRET = "invented-secret-for-isolated-auth-unit-tests";
const COOKIE = "authjs.session-token";
const configuration = {
    ...authConfig,
    secret: SECRET,
    trustHost: true,
    basePath: "/api/auth",
    providers: [Credentials({ authorize: () => null })],
} satisfies NextAuthConfig;

function applyCookies(response: Response, jar: Map<string, string>) {
    for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";")[0]!;
        const separator = pair.indexOf("=");
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (value) jar.set(name, value);
        else jar.delete(name);
    }
}
async function token(deadline = NOW + 1_800_000, id = "old-session") {
    return encode({
        secret: SECRET,
        salt: COOKIE,
        maxAge: 3600,
        token: {
            sub: "invented-user",
            idleSessionId: id,
            idleExpiresAt: deadline,
        },
    });
}
async function sessionRequest(cookie: string, data?: object) {
    return authCore.Auth(
        new Request("http://localhost/api/auth/session", {
            method: data ? "POST" : "GET",
            headers: {
                cookie: `${COOKIE}=${cookie}`,
                "content-type": "application/json",
            },
            ...(data ? { body: JSON.stringify({ data }) } : {}),
        }),
        { ...configuration, skipCSRFCheck: authCore.skipCSRFCheck },
    );
}
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

it("Should preserve renewed claims when an older passive Auth.js response arrives last", async () => {
    const oldToken = await token();
    const passive = await sessionRequest(oldToken);
    expect(
        passive.headers
            .getSetCookie()
            .some((cookie) => cookie.startsWith(`${COOKIE}=`)),
    ).toBe(true);
    vi.setSystemTime(NOW + 60_000);
    const renewed = await sessionRequest(oldToken, {
        idleActivity: true,
        idleSessionId: "old-session",
        idleForMs: 0,
    });
    const jar = new Map([[COOKIE, oldToken]]);
    applyCookies(renewed, jar);
    const renewedCookie = jar.get(COOKIE)!;
    applyCookies(passiveSessionResponse(passive), jar);
    expect(jar.get(COOKIE) === renewedCookie).toBe(true);
    expect(
        await decode({ token: jar.get(COOKIE), salt: COOKIE, secret: SECRET }),
    ).toMatchObject({
        sub: "invented-user",
        idleExpiresAt: NOW + 60_000 + 1_800_000,
    });
});

it("Should preserve a new login when an older passive response deletes its expired session", async () => {
    const oldToken = await token(NOW);
    const expired = await sessionRequest(oldToken);
    expect(
        expired.headers
            .getSetCookie()
            .some(
                (cookie) =>
                    cookie.startsWith(`${COOKIE}=`) &&
                    cookie.includes("Max-Age=0"),
            ),
    ).toBe(true);
    const newToken = await token(NOW + 1_800_000, "new-session");
    const jar = new Map([[COOKIE, newToken]]);
    applyCookies(passiveSessionResponse(expired), jar);
    expect(jar.get(COOKIE) === newToken).toBe(true);
});

it("Should preserve other cookies and headers while removing secure session chunks", () => {
    const headers = new Headers({
        location: "/login",
        "x-middleware-next": "1",
    });
    headers.append("set-cookie", "__Secure-authjs.session-token.0=old; Path=/");
    headers.append(
        "set-cookie",
        "__Secure-authjs.session-token.1=; Max-Age=0; Path=/",
    );
    headers.append("set-cookie", "authjs.csrf-token=invented; Path=/");
    const response = passiveSessionResponse(
        new Response(null, { status: 307, headers }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.getSetCookie()).toEqual([
        "authjs.csrf-token=invented; Path=/",
    ]);
});

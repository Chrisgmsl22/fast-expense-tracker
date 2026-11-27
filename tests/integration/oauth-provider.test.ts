import { createHash, randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { createLocalJWKSet, jwtVerify } from "jose";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => vi.stubEnv("AUTH_URL", "http://localhost:3995"));

import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import {
    apiResourceIdentifier,
    registerNativeClient,
} from "@/lib/auth/oauth-client";
import { PrismaUserProvisioningRepository } from "@/lib/repositories/user-provisioning.repository";

const origin = "http://localhost:3995";
const issuer = origin + "/api/auth";
const resource = apiResourceIdentifier(origin);
const clientId = "invented-native-client";
const redirectUri = "fet-test://oauth/callback";
const provider = betterAuth({
    ...authConfig,
    baseURL: origin,
    secret: "invented-test-secret-only-abcdefghijklmnopqrstuvwxyz",
    database: prismaAdapter(db, { provider: "postgresql" }),
});
const account = {
    name: "Invented",
    email: "oauth@example.com",
    password: "Invented-password-123",
};

afterAll(() => vi.unstubAllEnvs());

function call(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    headers.set("x-forwarded-for", "192.0.2.42");
    return provider.handler(
        new Request(issuer + path, { ...init, headers, redirect: "manual" }),
    );
}

function postJson(path: string, body: unknown, cookie?: string) {
    return call(path, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
    });
}

function postForm(path: string, fields: Record<string, string>) {
    return call(path, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields),
    });
}

function cookieOf(response: Response) {
    return response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
}

function pkce() {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
}

function authorizeQuery(
    challenge: string,
    overrides: Record<string, string | null> = {},
) {
    const params: Record<string, string | null> = {
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "openid profile email offline_access fet:api",
        state: "invented-state",
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource,
        ...overrides,
    };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
        if (value !== null) query.set(key, value);
    return query.toString();
}

async function authorize(query: string, cookie?: string) {
    const response = await call("/oauth2/authorize?" + query, {
        headers: cookie ? { cookie } : {},
    });
    expect(response.status).toBe(302);
    return new URL(response.headers.get("location")!, origin);
}

async function signIn(oauthQuery?: string) {
    const response = await postJson("/sign-in/email", {
        email: account.email,
        password: account.password,
        ...(oauthQuery && { oauth_query: oauthQuery }),
    });
    expect(response.status).toBe(200);
    return { cookie: cookieOf(response), body: await response.json() };
}

async function consent(location: URL, cookie: string, accept: boolean) {
    const response = await postJson(
        "/oauth2/consent",
        { accept, oauth_query: location.search.slice(1) },
        cookie,
    );
    expect(response.status).toBe(200);
    return new URL((await response.json()).url);
}

async function exchange(code: string, verifier: string) {
    return postForm("/oauth2/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource,
    });
}

function refresh(refreshToken: string) {
    return postForm("/oauth2/token", {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        resource,
    });
}

/** Signs in, consents when asked, and returns a code with its PKCE verifier. */
async function codeFor() {
    const { verifier, challenge } = pkce();
    const query = authorizeQuery(challenge);
    const login = await authorize(query);
    expect(login.pathname).toBe("/login");
    const { cookie, body } = await signIn(login.search.slice(1));
    let callback = new URL(body.url, origin);
    if (callback.pathname === "/consent")
        callback = await consent(callback, cookie, true);
    expect(callback.href.startsWith(redirectUri)).toBe(true);
    return { code: callback.searchParams.get("code")!, verifier, cookie };
}

async function tokensFor() {
    const { code, verifier, cookie } = await codeFor();
    const response = await exchange(code, verifier);
    expect(response.status).toBe(200);
    return { tokens: await response.json(), cookie };
}

let userId: string;
beforeEach(async () => {
    ({ userId } = await new PrismaUserProvisioningRepository(
        db,
    ).createUserWithStarterKit(account));
    await registerNativeClient(db, {
        clientId,
        name: "Invented native client",
        redirectUris: [redirectUri],
        resource,
    });
});

describe("OAuth 2.1 provider", () => {
    it("guard: issues a JWKS-verifiable JWT, a refresh token and an ID token for an S256 public client", async () => {
        const { tokens } = await tokensFor();
        expect(tokens.refresh_token).toEqual(expect.any(String));
        expect(tokens.id_token).toEqual(expect.any(String));
        const jwks = createLocalJWKSet(await (await call("/jwks")).json());
        const { payload } = await jwtVerify(tokens.access_token, jwks, {
            issuer,
            audience: resource,
        });
        expect(payload.sub).toBe(userId);
        expect(payload.exp! - payload.iat!).toBe(3600);
        expect(String(payload.scope).split(" ")).toContain("fet:api");
        const idToken = await jwtVerify(tokens.id_token, jwks, {
            issuer,
            audience: clientId,
        });
        expect(idToken.payload.sub).toBe(userId);
    });

    it("guard: refuses a wrong verifier and a reused code", async () => {
        const { code, verifier } = await codeFor();
        const wrong = await exchange(code, pkce().verifier);
        expect(wrong.status).toBe(400);
        const fresh = await codeFor();
        expect((await exchange(fresh.code, fresh.verifier)).status).toBe(200);
        const reused = await exchange(fresh.code, fresh.verifier);
        expect(reused.status).toBe(400);
        expect((await reused.json()).error).toBe("invalid_grant");
        expect(verifier).not.toBe(fresh.verifier);
    });

    it.each([
        [
            "a missing code_challenge",
            { code_challenge: null },
            "invalid_request",
        ],
        [
            "the plain method",
            { code_challenge_method: "plain" },
            "invalid_request",
        ],
        [
            "a scope outside the list",
            { scope: "openid fet:admin" },
            "invalid_scope",
        ],
    ])("guard: refuses %s", async (_label, overrides, error) => {
        const { cookie } = await signIn();
        const location = await authorize(
            authorizeQuery(pkce().challenge, overrides),
            cookie,
        );
        expect(location.searchParams.get("error")).toBe(error);
        expect(location.searchParams.get("code")).toBeNull();
    });

    it.each([
        ["an unregistered redirect URI", { redirect_uri: "fet-evil://x/cb" }],
        ["an unknown client id", { client_id: "invented-unknown-client" }],
    ])("guard: refuses %s without redirecting to it", async (_l, overrides) => {
        const { cookie } = await signIn();
        const location = await authorize(
            authorizeQuery(pkce().challenge, overrides),
            cookie,
        );
        expect(location.origin + location.pathname).toBe(issuer + "/error");
        expect(location.searchParams.get("code")).toBeNull();
    });

    it("guard: rotates refresh tokens and ends the family when a rotated token is reused", async () => {
        const { tokens } = await tokensFor();
        const rotated = await refresh(tokens.refresh_token);
        expect(rotated.status).toBe(200);
        const next = await rotated.json();
        expect(next.refresh_token).not.toBe(tokens.refresh_token);
        expect((await refresh(tokens.refresh_token)).status).toBe(400);
        expect((await refresh(next.refresh_token)).status).toBe(400);
    });

    it("guard: refreshes after the web session row expired", async () => {
        const { tokens } = await tokensFor();
        await db.session.updateMany({
            data: { expiresAt: new Date(Date.now() - 1000) },
        });
        expect((await refresh(tokens.refresh_token)).status).toBe(200);
    });

    it("guard: keeps an offline_access refresh token on web logout and drops it on revoke", async () => {
        const { tokens, cookie } = await tokensFor();
        expect((await postJson("/sign-out", {}, cookie)).status).toBe(200);
        const afterLogout = await refresh(tokens.refresh_token);
        expect(afterLogout.status).toBe(200);
        const { refresh_token } = await afterLogout.json();
        const revoked = await postForm("/oauth2/revoke", {
            token: refresh_token,
            token_type_hint: "refresh_token",
            client_id: clientId,
        });
        expect(revoked.status).toBe(200);
        expect((await refresh(refresh_token)).status).toBe(400);
    });

    it("guard: a signed-in web user cannot create, update or delete a client", async () => {
        const { cookie } = await signIn();
        const before = await db.oAuthClient.findMany();
        for (const path of [
            "/oauth2/create-client",
            "/oauth2/update-client",
            "/oauth2/delete-client",
            "/oauth2/register",
        ]) {
            const response = await postJson(
                path,
                {
                    client_id: clientId,
                    redirect_uris: ["fet-evil://x/cb"],
                    token_endpoint_auth_method: "none",
                    update: { redirect_uris: ["fet-evil://x/cb"] },
                },
                cookie,
            );
            expect(response.status).toBeGreaterThanOrEqual(400);
        }
        await expect(
            provider.api.adminCreateOAuthClient({
                headers: new Headers({ cookie }),
                body: { redirect_uris: ["fet-evil://x/cb"] },
            }),
        ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
        expect(await db.oAuthClient.findMany()).toEqual(before);
    });

    it("guard: refuses dynamic registration without a session", async () => {
        const response = await postJson("/oauth2/register", {
            redirect_uris: ["fet-evil://x/cb"],
            token_endpoint_auth_method: "none",
        });
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(await db.oAuthClient.count()).toBe(1);
    });

    it("guard: serves discovery and JWKS without a session", async () => {
        const openid = await call("/.well-known/openid-configuration");
        const metadata = await oauthProviderAuthServerMetadata(provider)(
            new Request(
                origin + "/.well-known/oauth-authorization-server/api/auth",
            ),
        );
        for (const response of [openid, metadata]) {
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                issuer,
                authorization_endpoint: issuer + "/oauth2/authorize",
                token_endpoint: issuer + "/oauth2/token",
                revocation_endpoint: issuer + "/oauth2/revoke",
                jwks_uri: issuer + "/jwks",
                code_challenge_methods_supported: ["S256"],
            });
        }
        const jwks = await call("/jwks");
        expect(jwks.status).toBe(200);
        expect((await jwks.json()).keys).toHaveLength(1);
    });

    it("guard: consent deny returns access_denied, accept is remembered for the client", async () => {
        const { challenge } = pkce();
        const login = await authorize(authorizeQuery(challenge));
        const { cookie, body } = await signIn(login.search.slice(1));
        const denied = await consent(new URL(body.url, origin), cookie, false);
        expect(denied.href.startsWith(redirectUri)).toBe(true);
        expect(denied.searchParams.get("error")).toBe("access_denied");
        expect(denied.searchParams.get("code")).toBeNull();

        const page = await authorize(authorizeQuery(challenge), cookie);
        expect(page.pathname).toBe("/consent");
        const accepted = await consent(page, cookie, true);
        expect(accepted.href.startsWith(redirectUri)).toBe(true);
        expect(accepted.searchParams.get("code")).toEqual(expect.any(String));
        expect(accepted.searchParams.get("state")).toBe("invented-state");

        const again = await authorize(authorizeQuery(challenge), cookie);
        expect(again.href.startsWith(redirectUri)).toBe(true);
        expect(again.searchParams.get("code")).toEqual(expect.any(String));
    });
});

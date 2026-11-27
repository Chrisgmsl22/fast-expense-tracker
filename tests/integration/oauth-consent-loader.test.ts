import { createHash, randomBytes } from "node:crypto";
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

const { requestHeaders } = vi.hoisted(() => {
    vi.stubEnv("AUTH_URL", "http://localhost:3994");
    vi.stubEnv(
        "AUTH_SECRET",
        "invented-loader-secret-only-abcdefghijklmnopqrstuvwxyz",
    );
    return { requestHeaders: { current: new Headers() } };
});
vi.mock("next/headers", () => ({
    headers: async () => requestHeaders.current,
    cookies: async () => ({ set: vi.fn() }),
}));

import { authProvider, signIn } from "@/auth";
import { db } from "@/lib/db";
import {
    apiResourceIdentifier,
    registerNativeClient,
} from "@/lib/auth/oauth-client";
import { answerConsent, loadConsentRequest } from "@/lib/auth/oauth-consent";
import { OAuthRequestExpiredError } from "@/lib/auth/oauth-query";
import { PrismaUserProvisioningRepository } from "@/lib/repositories/user-provisioning.repository";

const origin = "http://localhost:3994";
const clientId = "invented-loader-client";
const account = {
    name: "Invented",
    email: "loader@example.com",
    password: "Invented-password-123",
};

afterAll(() => vi.unstubAllEnvs());
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

function call(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    headers.set("x-forwarded-for", "192.0.2.43");
    return authProvider.handler(
        new Request(origin + "/api/auth" + path, { ...init, headers }),
    );
}

/** A signed-in cookie and the signed query the provider sends to /consent. */
async function consentQuery() {
    const signIn = await call("/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            email: account.email,
            password: account.password,
        }),
    });
    const cookie = signIn.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    const verifier = randomBytes(32).toString("base64url");
    const query = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: "fet-test://oauth/callback",
        state: "invented-state",
        scope: "openid offline_access fet:api",
        code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
        code_challenge_method: "S256",
        resource: apiResourceIdentifier(origin),
    });
    const response = await call("/oauth2/authorize?" + query, {
        headers: { cookie },
    });
    const location = new URL(response.headers.get("location")!, origin);
    expect(location.pathname).toBe("/consent");
    requestHeaders.current = new Headers({ cookie, ...browser });
    return location.search.slice(1);
}

/** The signed query the provider puts on /login for a signed-out browser. */
async function loginQuery() {
    const query = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: "fet-test://oauth/callback",
        scope: "openid offline_access fet:api",
        code_challenge: createHash("sha256")
            .update(randomBytes(32).toString("base64url"))
            .digest("base64url"),
        code_challenge_method: "S256",
        resource: apiResourceIdentifier(origin),
    });
    const response = await call("/oauth2/authorize?" + query);
    const location = new URL(response.headers.get("location")!, origin);
    expect(location.pathname).toBe("/login");
    return location.search.slice(1);
}

const browser = { origin, "x-forwarded-for": "192.0.2.43" };

beforeEach(async () => {
    requestHeaders.current = new Headers(browser);
    await new PrismaUserProvisioningRepository(db).createUserWithStarterKit(
        account,
    );
    await registerNativeClient(db, {
        clientId,
        name: "Invented loader client",
        redirectUris: ["fet-test://oauth/callback"],
        resource: apiResourceIdentifier(origin),
    });
});

describe("loadConsentRequest", () => {
    it("guard: returns the client name and scopes for a valid signed query", async () => {
        expect(await loadConsentRequest(await consentQuery())).toEqual({
            clientName: "Invented loader client",
            scopes: ["openid", "offline_access", "fet:api"],
        });
    });

    it("guard: returns null for an unsigned or tampered query", async () => {
        const query = new URLSearchParams(await consentQuery());
        query.set("sig", "invented-signature");
        expect(await loadConsentRequest(query.toString())).toBeNull();
        query.delete("sig");
        expect(await loadConsentRequest(query.toString())).toBeNull();
    });

    it("guard: returns null for an expired query", async () => {
        const query = await consentQuery();
        vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 601_000 });
        expect(await loadConsentRequest(query)).toBeNull();
    });

    it("guard: returns null for an unknown client", async () => {
        const query = await consentQuery();
        await db.oAuthClient.deleteMany();
        expect(await loadConsentRequest(query)).toBeNull();
    });

    it("guard: returns null without a session", async () => {
        const query = await consentQuery();
        requestHeaders.current = new Headers(browser);
        expect(await loadConsentRequest(query)).toBeNull();
    });

    it("guard: rethrows an infrastructure failure instead of hiding it", async () => {
        const query = await consentQuery();
        const outage = new Error("invented database outage");
        vi.spyOn(authProvider.api, "getOAuthClientPublic").mockRejectedValue(
            outage,
        );
        await expect(loadConsentRequest(query)).rejects.toBe(outage);
    });
});

describe("answerConsent", () => {
    it("guard: allow returns the redirect URI with a code and the state", async () => {
        const url = new URL(await answerConsent(true, await consentQuery()));
        expect(url.href.startsWith("fet-test://oauth/callback?")).toBe(true);
        expect(url.searchParams.get("code")).toEqual(expect.any(String));
        expect(url.searchParams.get("state")).toBe("invented-state");
    });

    it("guard: deny returns access_denied without a code", async () => {
        const url = new URL(await answerConsent(false, await consentQuery()));
        expect(url.searchParams.get("error")).toBe("access_denied");
        expect(url.searchParams.get("code")).toBeNull();
    });

    it("guard: an expired query throws OAuthRequestExpiredError", async () => {
        const query = await consentQuery();
        vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 601_000 });
        await expect(answerConsent(true, query)).rejects.toBeInstanceOf(
            OAuthRequestExpiredError,
        );
    });
});

describe("signIn with a signed OAuth query", () => {
    const credentials = { email: account.email, password: account.password };

    it("guard: an expired query throws OAuthRequestExpiredError and creates no session", async () => {
        const oauthQuery = await loginQuery();
        vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 601_000 });
        await expect(
            signIn("credentials", { ...credentials, oauthQuery }),
        ).rejects.toBeInstanceOf(OAuthRequestExpiredError);
        expect(await db.session.count()).toBe(0);
    });

    it("guard: a forged signature throws OAuthRequestExpiredError and creates no session", async () => {
        const query = new URLSearchParams(await loginQuery());
        query.set("sig", "invented-forged-signature");
        await expect(
            signIn("credentials", {
                ...credentials,
                oauthQuery: query.toString(),
            }),
        ).rejects.toBeInstanceOf(OAuthRequestExpiredError);
        expect(await db.session.count()).toBe(0);
    });

    it("returns the consent URL for a valid query", async () => {
        const next = await signIn("credentials", {
            ...credentials,
            oauthQuery: await loginQuery(),
        });
        expect(new URL(next!, origin).pathname).toBe("/consent");
    });
});

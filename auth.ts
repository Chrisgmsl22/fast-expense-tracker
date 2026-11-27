import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { toWebSession, type WebSession } from "@/lib/auth/web-session";
import { OAuthRequestExpiredError } from "@/lib/auth/oauth-query";

export const authProvider = betterAuth({
    ...authConfig,
    database: prismaAdapter(db, { provider: "postgresql" }),
});

export class InvalidCredentialsError extends Error {}

async function isInvalidOAuthQuery(response: Response) {
    if (response.status !== 400) return false;
    const body: unknown = await response
        .clone()
        .json()
        .catch(() => null);
    return (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        body.error === "invalid_signature"
    );
}

export async function publishAuthCookies(response: Response): Promise<void> {
    const store = await cookies();
    for (const [name, value] of parseSetCookieHeader(
        response.headers.get("set-cookie") ?? "",
    )) {
        store.set(name, value.value, toCookieOptions(value));
    }
}

export async function auth(): Promise<WebSession | null> {
    const session = await authProvider.api.getSession({
        headers: await headers(),
    });
    return session ? toWebSession(session) : null;
}

export async function signIn(
    _provider: "credentials",
    input: {
        email: string;
        password: string;
        redirectTo?: string;
        redirect?: boolean;
        oauthQuery?: string;
    },
): Promise<string | undefined> {
    const requestHeaders = new Headers(await headers());
    requestHeaders.set("content-type", "application/json");
    if (input.oauthQuery) requestHeaders.set("accept", "application/json");
    const baseURL = (await authProvider.$context).baseURL;
    const response = await authProvider.handler(
        new Request(baseURL + "/sign-in/email", {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify({
                email: input.email,
                password: input.password,
                ...(input.oauthQuery && { oauth_query: input.oauthQuery }),
            }),
        }),
    );
    if (response.status === 401) throw new InvalidCredentialsError();
    if (input.oauthQuery && (await isInvalidOAuthQuery(response)))
        throw new OAuthRequestExpiredError();
    if (!response.ok) throw new Error("Authentication failed");
    await publishAuthCookies(response);
    if (!input.oauthQuery) return undefined;
    const body: unknown = await response.json();
    return isRedirectBody(body) ? body.url : undefined;
}

function isRedirectBody(body: unknown): body is { url: string } {
    return (
        typeof body === "object" &&
        body !== null &&
        "url" in body &&
        typeof body.url === "string"
    );
}

export async function signOut(
    input: { redirectTo?: string } = {},
): Promise<void> {
    const response = await authProvider.api.signOut({
        headers: await headers(),
        asResponse: true,
    });
    if (!response.ok) throw new Error("Sign-out failed");
    await publishAuthCookies(response);
    if (input.redirectTo) redirect(input.redirectTo);
}

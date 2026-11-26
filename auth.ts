import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { toWebSession, type WebSession } from "@/lib/auth/web-session";

export const authProvider = betterAuth({
    ...authConfig,
    database: prismaAdapter(db, { provider: "postgresql" }),
});

export class InvalidCredentialsError extends Error {}

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
    },
): Promise<void> {
    const requestHeaders = new Headers(await headers());
    requestHeaders.set("content-type", "application/json");
    const baseURL = (await authProvider.$context).baseURL;
    const response = await authProvider.handler(
        new Request(baseURL + "/sign-in/email", {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify({
                email: input.email,
                password: input.password,
            }),
        }),
    );
    if (response.status === 401) throw new InvalidCredentialsError();
    if (!response.ok) throw new Error("Authentication failed");
    await publishAuthCookies(response);
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

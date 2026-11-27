import { NextResponse, type NextRequest } from "next/server";
import { authProvider } from "@/auth";
import { getSessionCookie } from "better-auth/cookies";
import { EXPIRED_LOGIN_PATH } from "@/lib/auth/idle-session";
import { signedOAuthQuery } from "@/lib/auth/oauth-query";

export async function proxy(request: NextRequest) {
    const session = await authProvider.api.getSession({
        headers: request.headers,
    });
    const { pathname, searchParams } = request.nextUrl;
    if (["/login", "/signup"].includes(pathname)) {
        const continuesOAuth =
            pathname === "/login" &&
            signedOAuthQuery(Object.fromEntries(searchParams)) !== undefined;
        return session && !continuesOAuth
            ? NextResponse.redirect(new URL("/dashboard", request.url))
            : NextResponse.next();
    }
    if (session) return NextResponse.next();
    const hasCookie = Boolean(getSessionCookie(request));
    const login = new URL(
        hasCookie ? EXPIRED_LOGIN_PATH : "/login",
        request.url,
    );
    if (!hasCookie) login.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(login);
}

export const config = {
    matcher: [
        "/((?!api|\\.well-known|_next/static|_next/image|favicon.ico).*)",
    ],
};

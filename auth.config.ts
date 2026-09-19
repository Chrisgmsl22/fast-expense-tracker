import type { NextAuthConfig, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

import {
    EXPIRED_LOGIN_PATH,
    IDLE_TIMEOUT_MS,
    IDLE_TIMEOUT_SECONDS,
    isIdleElapsed,
} from "@/lib/auth/idle-session";

/**
 * Shared Auth.js base config.
 *
 * Holds provider-independent settings (`pages`, the route-gate + token/session
 * callbacks) so `auth.ts` and the `proxy.ts` route gate compose from one
 * source. Under Next.js 16 the proxy runs on the Node runtime (ADR-0007), so
 * this no longer needs to be Edge-safe.
 *
 * All callbacks live here in a single object: `auth.ts` spreads this config and
 * adds the Credentials provider, so a second `callbacks` object there would
 * shallow-override and silently drop `authorized`.
 */
const LOGIN_PATH = "/login";
const DEFAULT_AUTHED_PATH = "/dashboard";

export const authConfig = {
    pages: {
        signIn: LOGIN_PATH,
    },
    providers: [], // Credentials provider added in auth.ts
    // The signed idle deadline survives Auth.js token renewal on passive reads.
    session: {
        strategy: "jwt",
        maxAge: IDLE_TIMEOUT_SECONDS,
    },
    callbacks: {
        // Route gate, evaluated by the proxy on every matched request.
        // `/api/auth/*` never reaches here — it's excluded by the proxy matcher.
        authorized({ auth, request }) {
            const isLoggedIn = Boolean(auth?.user);
            const isOnLogin = request.nextUrl.pathname === LOGIN_PATH;

            if (isOnLogin) {
                // Don't strand a signed-in user on the login screen.
                return isLoggedIn
                    ? Response.redirect(
                          new URL(DEFAULT_AUTHED_PATH, request.nextUrl),
                      )
                    : true;
            }

            if (
                !isLoggedIn &&
                request.cookies
                    .getAll()
                    .some(({ name }) =>
                        /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/.test(
                            name,
                        ),
                    )
            ) {
                return Response.redirect(
                    new URL(EXPIRED_LOGIN_PATH, request.nextUrl),
                );
            }
            if (!isLoggedIn) {
                const login = new URL(LOGIN_PATH, request.nextUrl);
                login.searchParams.set("callbackUrl", request.nextUrl.href);
                return Response.redirect(login);
            }
            return true;
        },
        jwt({ token, user, trigger, session }) {
            const now = Date.now();
            if (user?.id) {
                token.sub = user.id;
                token.idleExpiresAt = now + IDLE_TIMEOUT_MS;
                token.idleSessionId = crypto.randomUUID();
                return token;
            }
            // Prior tokens lack an idle deadline and require a new login.
            if (
                !token.sub ||
                typeof token.idleExpiresAt !== "number" ||
                !Number.isFinite(token.idleExpiresAt) ||
                now >= token.idleExpiresAt ||
                typeof token.idleSessionId !== "string" ||
                !token.idleSessionId
            ) {
                return null;
            }
            if (
                trigger === "update" &&
                session?.idleActivity === true &&
                session.idleSessionId === token.idleSessionId &&
                isIdleElapsed(session.idleForMs)
            ) {
                token.idleExpiresAt = Math.max(
                    token.idleExpiresAt,
                    now - session.idleForMs + IDLE_TIMEOUT_MS,
                );
            }
            return token;
        },
        session({ session, token }: { session: Session; token: JWT }) {
            if (token.sub) {
                session.user.id = token.sub;
            }
            session.idleExpiresAt = token.idleExpiresAt;
            session.idleSessionId = token.idleSessionId;
            session.expires = new Date(token.idleExpiresAt ?? 0).toISOString();
            return session;
        },
    },
} satisfies NextAuthConfig;

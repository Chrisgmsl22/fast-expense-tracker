import type { NextAuthConfig } from "next-auth";

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

            // Everything else requires a session; `false` redirects to signIn.
            return isLoggedIn;
        },
        // JWT strategy (no DB sessions with Credentials): carry the DB user id
        // on the standard `sub` claim so `session.user.id` is populated for
        // server actions. `sub` is typed `string | undefined` by default, so no
        // module augmentation is needed.
        jwt({ token, user }) {
            if (user?.id) {
                token.sub = user.id;
            }
            return token;
        },
        session({ session, token }) {
            if (token.sub) {
                session.user.id = token.sub;
            }
            return session;
        },
    },
} satisfies NextAuthConfig;

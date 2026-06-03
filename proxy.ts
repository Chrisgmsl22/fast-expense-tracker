/**
 * Next.js 16 proxy (formerly `middleware.ts`). Runs on the Node.js runtime, so
 * it can use the full `auth` instance directly — no Edge-runtime constraint and
 * no need to keep the proxy off the Node-only deps that slice 1.3 adds
 * (Credentials provider, password hashing). See ADR-0007.
 *
 * Route protection is driven by the `authorized` callback in `auth.config.ts`,
 * which currently returns true — nothing is blocked yet. Slice 1.3 wires the
 * real whitelist (/login, /api/auth/*) + block.
 */
export { auth as proxy } from "@/auth";

export const config = {
    // Run on app routes; skip the auth API, Next internals, and static assets.
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

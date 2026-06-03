# ADR-0007: Next.js 16 `proxy.ts` Convention for Auth Route Protection

Date: 2026-06-02
Status: Accepted

## Context

Slice 1.1 scaffolds Auth.js v5 and a route-protection entry point. The phase
task and the Auth.js v5 docs both say to create `middleware.ts` with
`export { auth as middleware }`. On this repo's stack (Next.js 16.2.6) that
fails the build:

```
Error: The file "./middleware.ts" must export a function, either as a default
export or as a named "middleware" export.
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
```

Next.js 16 **renamed `middleware.ts` → `proxy.ts`** (named export `middleware`
→ `proxy`). Critically, the two conventions differ in runtime:

- `middleware.ts` (deprecated) — **Edge** runtime.
- `proxy.ts` — **Node.js** runtime, and the runtime is **not configurable**.
  Edge is not supported in `proxy`.

(Source: Next.js 16 upgrade guide + `proxy.ts` file-convention docs.)

The original split-config pattern — an Edge-safe `auth.config.ts` (no Node-only
deps) separate from a full `auth.ts` — exists specifically because Edge
middleware can't import Node-only code like `bcrypt` or the Prisma client. That
constraint is what forced the split.

## Decision

Use **`proxy.ts`** (Next.js 16 native), exporting the Auth.js handler as
`proxy`:

```ts
// proxy.ts
export { auth as proxy } from "@/auth";
export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

Because `proxy` runs on the **Node runtime**, the Edge-safety constraint no
longer applies. Consequences for the auth wiring:

- The proxy uses the **full `auth` instance** from `auth.ts` directly — no need
  to build a separate Edge-only instance from `auth.config.ts`.
- Slice 1.3 can add the Credentials provider and `bcrypt` to `auth.ts` without
  breaking route protection (it all runs on Node now).
- The `auth.config.ts` / `auth.ts` split is **retained for organization only**
  (shared `pages` + `authorized` callback vs. provider list + session config),
  not because Edge demands it.

## Consequences

**Positive:**

- Build-correct on Next.js 16; no deprecation warning.
- Simpler auth model for 1.3 — no Edge/Node dependency partitioning to police;
  bcrypt + Prisma in `auth.ts` are fine for the proxy path.

**Negative / watch:**

- **No Edge runtime for route protection.** If a future need wants Edge-speed
  gating, Next.js 16 says to stay on `middleware.ts` for now. Not a concern at
  1-user scale; route protection on Node is fine.
- The Auth.js v5 docs still show `middleware.ts`; our `proxy.ts` diverges from
  copy-paste examples. Documented here so 1.3 doesn't "fix" it back.

## Notes

- A codemod exists (`next-codemod` `middleware-to-proxy`) but the change here was
  a single hand-written file, so it was applied manually.
- The `authorized` callback (in `auth.config.ts`) is the route-gate; in 1.1 it
  returns `true` (nothing blocked) so the app isn't locked before 1.3's login
  flow exists.

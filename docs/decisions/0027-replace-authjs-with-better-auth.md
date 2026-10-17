# ADR-0027: Replace Auth.js with Better Auth, self-hosted

Date: 2026-10-16
Status: Accepted
Builds on: ADR-0007 (proxy convention), ADR-0026 (signup gate)
Revisits: ADR-0009 §2 (login rate limiting deferred)
Spec: [0009](../specs/0009-auth-module-better-auth.md)

## Context

A native iOS client is planned. Auth.js reads only a browser cookie, has no
native-app support, and has received security fixes only since the Better Auth
team took it over on 2025-09-22. We run `next-auth 5.0.0-beta.31`. The session
is a JWT in a cookie with no database row, so a session cannot be ended from the
server. The friend launch also needs a login throttle (CHORE-32) and a password
change that ends old sessions (CHORE-33).

## Decision

1. Replace Auth.js with Better Auth. It runs inside the Next.js app, and users,
   accounts and sessions live in Neon through the Prisma adapter. No hosted
   identity provider.
2. The web keeps a cookie, now backed by a database session. The 30-minute idle
   rule stays: `expiresIn: 1800`, `disableSessionRefresh: true`, and only real
   activity moves the expiry. Passive reads never renew.
3. Existing data keeps its shape. Passwords stay bcrypt cost 10 through a custom
   `hash` and `verify`. New ids are UUIDs (`generateId: "uuid"`). The `User`
   model keeps its name and its ids. Each hash is copied to a credential
   `account` row.
4. The move is expand, switch, contract. `User.password` is dropped only after
   2 weeks of clean use. The owner takes a Neon restore point before each
   production step.
5. Pages and actions read the user id through one seam, `getSessionUserId()`,
   never through the library directly.
6. The Better Auth rate limiter is on, with `storage: "database"`, because
   memory storage does not hold across serverless instances.
7. Pin an exact 1.7.x release that is at least 2 weeks old.

## Consequences

- Everyone logs in once when the switch deploys. Passwords do not change.
- New tables: `account`, `session`, `verification`, `rateLimit`.
- A session can be ended from the server, so change-password and delete-account
  can log out every device.
- Until the contract step, a Vercel rollback to the pre-switch build still logs
  users in, because `User.password` keeps every hash.
- CHORE-32 is covered by item 6. CHORE-33 builds on the new library.
- One more runtime dependency on a young library. Leaving it later touches the
  seam, the auth routes and the login actions, not the 30 data actions.

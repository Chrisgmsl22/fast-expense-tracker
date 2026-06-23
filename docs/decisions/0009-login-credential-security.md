# ADR-0009: Login Credential Security — Hashing and Rate-Limiting

Date: 2026-06-18
Status: Accepted

## Context

Slice 1.3 builds the login flow (Auth.js Credentials provider). Two design
questions were flagged when the slice was sketched:

1. **Password hashing**: bcrypt vs argon2.
2. **Login rate-limiting**: Vercel KV vs Upstash vs deferred.

Constraints specific to this app:

- It is **single-user** (one seeded admin — `prisma/seed.ts`). There is no
  public signup and no plan for one.
- The seed **already stores a bcrypt hash** (`bcryptjs`, cost 10) for the admin
  password. The login provider must verify against whatever the seed wrote.
- The repo is public and deployed; the login surface is internet-facing.

## Decision

### 1. Hashing: **bcryptjs** (argon2 rejected)

Verify passwords with `bcryptjs` — the same library and cost factor the seed
uses. The stored hash is bcrypt; verifying it requires bcrypt. Switching to
argon2 would orphan the seeded credential (login would never match) and add a
native/heavier dependency for no security gain at this scale. bcrypt at cost 10
is industry-standard and adequate for a single-user tool.

If the threat model ever changes (multi-user, elevated value), revisit argon2id
with a coordinated re-hash-on-next-login migration — not a silent swap.

### 2. Rate-limiting: **deferred** (no limiter in 1.3)

Ship login with no rate-limiter. Rationale:

- **One known account, no signup.** The only attack is online brute-force
  against a single password.
- A strong password (chosen by the user, stored in a password manager per
  setup.md §5) plus bcrypt cost 10 makes online guessing impractical.
- The candidate stores add real cost: **Vercel KV no longer exists** as a
  product, and Upstash Redis means a new Marketplace integration, env vars, and
  a mocked limiter in tests — disproportionate for a single-user tool.
- An **in-memory** limiter was considered and rejected: it resets on cold start
  and isn't shared across Fluid Compute instances, so it gives false confidence
  rather than real protection.

**Revisit trigger**: any move to multi-user, evidence of credential-stuffing in
logs, or exposing additional auth surfaces. At that point add `@upstash/ratelimit`
(sliding window, per-IP) on the login action and an Auth.js sign-in throttle.

## Consequences

**Positive**

- Login matches the seed with zero migration; no orphaned credentials.
- No new infrastructure, env vars, or external dependency for 1.3.
- The decision and its revisit trigger are recorded, not implicit.

**Negative / risks**

- No defense-in-depth against online brute-force beyond password strength +
  bcrypt cost. Accepted given the single-account threat model.
- A future multi-user pivot must add rate-limiting as an explicit follow-up;
  this ADR is the reminder.

## References

- `prisma/seed.ts` — stores the bcrypt admin hash (cost 10).
- `docs/operations/setup.md` §5–§6 — admin credentials + `AUTH_SECRET`.
- ADR-0003 — secret handling (public repo).
- ADR-0007 — Next.js 16 `proxy.ts` (route protection home).
- `docs/conventions/coding-conventions.md` §Auth, §Security.

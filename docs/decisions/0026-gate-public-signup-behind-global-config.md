# ADR-0026: Gate public signup behind a Vercel Global Config switch

Date: 2026-10-10
Status: Accepted
Builds on: ADR-0001 ($0 constraint), ADR-0021 (accounts made by hand), ADR-0022 (per-user categories)
Reverses: the "no public signup" deferral in spec 0006 §8

## Context

Friends want accounts, and today the owner creates each one by hand. CHORE-8.d
adds a public signup page. The owner wants to open and close signup at any time
without a code change or a redeploy, and to cap the number of accounts. An
environment variable needs a redeploy to change. A database flag needs an admin
screen or a manual SQL edit.

## Decision

1. Signup reads two keys from a Vercel Global Config store connected to the
   project: `signupEnabled` (boolean) and `maxUsers` (integer). A change in the
   Vercel dashboard applies within seconds, with no redeploy.
2. The read sits behind a `SignupGate` port, injected like the repositories,
   with a Global Config adapter (`@vercel/global-config` 1.5.1) and a fake for tests.
3. Fail closed. A missing store, a missing or malformed key, or a read error
   means signup is off.
4. Local development has no store. When neither `GLOBAL_CONFIG` nor
   `EDGE_CONFIG` is set (an empty value counts as unset) and `NODE_ENV` is not
   `production`, the adapter reads `SIGNUP_ENABLED` and `MAX_USERS` from the
   environment. A production build never falls back.
5. Only the signup page and the signup action read the gate. Login, the proxy
   and every other request never read it.
6. The cap counts `User` rows before the insert. The user and its starter kit
   are created in one transaction, so a failed signup leaves no half-made account.

## Consequences

- The owner opens and closes signup from the Vercel dashboard, with no deploy.
- One new runtime dependency and one new Vercel resource. Hobby includes
  Global Config at no cost, and signup reads it a few times per attempt.
- If Vercel or the store is unreachable, signup stays closed, never open.
- Leaving Vercel means replacing one adapter.
- Two signups at the same moment can exceed the cap by one. Accepted at this scale.
- Connect the store to Production only. Preview deployments then have no store
  and run as production builds, so signup is closed on previews.

# Execution plan — friend launch

**Written 2026-10-09.** Goal: friends can sign up and use the app with their
data private. Mobile (native app or PWA) waits until after this.

This is the **sequencing** document. The items live in
[`chores.json`](./chores.json) and [`bugs.json`](./bugs.json); this file says
the order and why. Delete it once the launch gate is passed and the follow-ups
are done.

The previous plan (the money rework, three tiers) is complete: CHORE-12,
the quick wins and the chin all merged.

## Rules for this push

- **One PR per item, one problem per PR.** Owner decision: the safest shape.
- **Run serially where files overlap.** CHORE-8.b and CHORE-27 both edit
  `prisma/seed.ts` and the category defaults: never in parallel.
- **Signup ships dark.** CHORE-8.d merges with the Global Config switch off.
  Turning it on is the launch, and it waits for the gate below.

## Before the switch goes on

| #   | Item          | Why it blocks                                                        |
| --- | ------------- | -------------------------------------------------------------------- |
| 1   | **BUG-8**     | Four writes accept another user's card id                            |
| 2   | **CHORE-31**  | `Foo@x.com` and `foo@x.com` would become two accounts                |
| 3   | **CHORE-8.b** | A new user has no categories, so cannot log an expense               |
| 4   | **CHORE-8.d** | The signup page, the on/off switch and the user cap                  |
| 5   | **CHORE-8.e** | The 8-step onboarding wizard, from `designs-screens/onboarding.html` |
| 6   | ~~CHORE-32~~  | Cancelled 2026-10-17: the CHORE-41 rate limiter covers it            |
| 7   | **CHORE-33**  | Change password in Settings; a lost password uses the reset runbook  |

**Owner steps, not PRs:** close PR #67 once the CHORE-8.b rebuild opens;
create and connect the Global Config store (CHORE-8.d documents it); protect
`main` ([`setup.md §4`](../operations/setup.md)).

**Launch:** set `signupEnabled` to true in Global Config.

## Soon after the first friends

| #   | Item         | What                                       |
| --- | ------------ | ------------------------------------------ |
| 8   | **CHORE-34** | Backup and restore runbook                 |
| 9   | **CHORE-35** | Security headers, CSP in report-only first |
| 10  | **BUG-9**    | Setup docs name the wrong DB variable      |
| 11  | **CHORE-37** | A short privacy page                       |

Then **CHORE-27** (P30) resumes the owner's own backlog. **CHORE-36**
(delete account) follows.

## Auth module migration

**Current auth plan, 2026-10-29:** Christian approved the visual design and
requested gradual delivery of this repo's auth service before the Swift app.
Use the [auth delivery plan](../plans/2026-10-29-auth-delivery-plan.md) for the
current sequence and gates. CHORE-39 merged in PR #102 after independent review.
Compatibility proof and CHORE-34 must finish before CHORE-40. Native auth
readiness includes a protected identity endpoint and a client contract; expense
APIs wait for mobile planning. The older sequence below is historical context
where it conflicts with that plan. CHORE-33's order still requires reconciliation
before the web switch; no existing password-change decision is silently replaced.

Spec [0009](../specs/0009-auth-module-better-auth.md), decided in
[ADR-0027](../decisions/0027-replace-authjs-with-better-auth.md) and
[ADR-0028](../decisions/0028-native-clients-use-oauth-with-pkce.md). It moves
login to Better Auth and prepares the iOS client. Run it in this order, one PR
at a time, because every step edits the same auth files:

| #   | Item          | What                                                    |
| --- | ------------- | ------------------------------------------------------- |
| A   | **CHORE-8.e** | Land first; it edits the same auth code                 |
| B   | **CHORE-34**  | Backup runbook; the restore points below depend on it   |
| C   | **CHORE-39**  | One seam for the signed-in user; no data change         |
| D   | **CHORE-40**  | Add the Better Auth tables; restore point first         |
| E   | **CHORE-41**  | Switch to Better Auth; restore point first              |
| F   | **CHORE-42**  | OAuth provider and the iOS client entry                 |
| G   | **CHORE-43**  | Drop `User.password` after 2 clean weeks; restore point |

CHORE-41 turns on the Better Auth rate limiter, which covers **CHORE-32**
(cancelled). **CHORE-33** ships on Auth.js and stays small, because spec 0009
replaces this login code; the move to Better Auth must keep its rule that a
password change signs out every other session. There is no email
reset: a forgotten password goes through a manual runbook that CHORE-33 adds
(`docs/operations/reset-a-password.md`). Owner decision
pending: whether this block runs before the launch switch or right after it.

## Capacity

Vercel, Neon and GlitchTip free tiers hold about 10 users, likely about 50
(audit 2026-10-09: pooled Neon URL, one Prisma client, no runtime errors in
the prior 7 days). No infrastructure change is needed for this launch.

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

| #   | Item          | Why it blocks                                                       |
| --- | ------------- | ------------------------------------------------------------------- |
| 1   | **BUG-8**     | Four writes accept another user's card id                           |
| 2   | **CHORE-31**  | `Foo@x.com` and `foo@x.com` would become two accounts               |
| 3   | **CHORE-8.b** | A new user has no categories, so cannot log an expense              |
| 4   | **CHORE-8.d** | The signup page, the on/off switch and the user cap                 |
| 5   | **CHORE-32**  | No throttle on login or signup (ADR-0009's multi-user trigger)      |
| 6   | **CHORE-33**  | No password change and no email reset, so a lost password needs SQL |

**Owner steps, not PRs:** close PR #67 once the CHORE-8.b rebuild opens;
create and connect the Global Config store (CHORE-8.d documents it); protect
`main` ([`setup.md §4`](../operations/setup.md)).

**Launch:** set `signupEnabled` to true in Global Config.

## Soon after the first friends

| #   | Item         | What                                       |
| --- | ------------ | ------------------------------------------ |
| 7   | **CHORE-34** | Backup and restore runbook                 |
| 8   | **CHORE-35** | Security headers, CSP in report-only first |
| 9   | **BUG-9**    | Setup docs name the wrong DB variable      |
| 10  | **CHORE-37** | A short privacy page                       |

Then **CHORE-27** (P11) resumes the owner's own backlog. **CHORE-36**
(delete account) and **CHORE-8.e** (onboarding wizard, needs a design) follow.

## Capacity

Vercel, Neon and GlitchTip free tiers hold about 10 users, likely about 50
(audit 2026-10-09: pooled Neon URL, one Prisma client, no runtime errors in
the prior 7 days). No infrastructure change is needed for this launch.

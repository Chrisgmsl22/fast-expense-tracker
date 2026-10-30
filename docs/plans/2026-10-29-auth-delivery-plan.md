# Auth delivery plan

Status: CHORE-39 merged. Compatibility investigation is next.

We will finish the auth service in this repo before we start the Swift app.
We will deliver one reviewed change at a time, beginning with the session
boundary. The web must remain usable after every merge. The first database
change waits for compatibility evidence and a usable recovery procedure.

The [approved design](2026-10-24-auth-design-review.html) explains the intended
behavior. The native app owns Face ID unlocks and their fallback behavior.
This plan covers the server work needed to support that app's later login.

## What finished means

The web signs existing users in through Better Auth without changing their
identity, password or financial records. It keeps its current idle behavior,
signup controls and onboarding. A test native client can complete login,
renew access, and call a protected endpoint that identifies its own user.

We hand the mobile repo a tested auth contract and recovery instructions.
Expense APIs, mobile screens and Face ID implementation belong to the mobile
phase. We will define those APIs when we know the first mobile journey.

Removing the old password storage is a separate, delayed step. It does not
block mobile development while the compatibility storage remains safe.

## Delivery order

| Step | Change                      | Size                                        | Gate before we continue                                                          |
| ---- | --------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | Isolate session reads       | Merged in PR #102                           | Tests and independent review passed                                              |
| 2    | Prove library compatibility | Medium research and local proof             | Every migration-critical question has evidence or a recorded decision            |
| 3    | Prepare database recovery   | Medium operational work                     | Recovery instructions and an invented-data restore rehearsal pass                |
| 4    | Add auth storage            | Medium migration                            | Data preservation tests pass; owner prepares recovery and merges                 |
| 5    | Switch the web login        | Large integration                           | Browser flows, rollback and account surveys pass                                 |
| 6    | Add native authorization    | Large protocol integration                  | Test client completes login, refresh and revocation cases                        |
| 7    | Prove mobile auth readiness | Medium integration and handoff              | Protected identity endpoint and documented client contract pass end to end       |
| 8    | Remove old password storage | Small change with irreversible consequences | At least two clean weeks after the switch, clean surveys and owner restore point |

Steps 1 to 7 run serially. Step 8 runs on a separate observation schedule.
The web switch stays one complete integration because the credential copy and
new login must deploy together. If the compatibility proof reveals a safer
split, we revise the plan before implementation.

<details>
<summary>Agent notes: work items and PR boundaries</summary>

| Step | Existing item or planned work      | Planned PR title                | Depends on                                  |
| ---- | ---------------------------------- | ------------------------------- | ------------------------------------------- |
| 1    | CHORE-39                           | `fet-chore-session-seam`        | Onboarding merged, PR #97                   |
| 2    | CHORE-44, compatibility evidence   | `fet-docs-auth-compatibility`   | Step 1                                      |
| 3    | CHORE-34                           | `fet-docs-recovery-runbook`     | None technically; scheduled after step 2    |
| 4    | CHORE-40                           | `fet-chore-auth-expand-schema`  | Steps 1, 2 and 3 merged                     |
| 5    | CHORE-41                           | `fet-chore-better-auth-switch`  | Step 4 merged; restore point                |
| 6    | CHORE-42                           | `fet-feat-oauth-provider`       | Step 5 merged; reviewed provider migration  |
| 7    | Auth readiness, planning follow-up | `fet-feat-mobile-auth-contract` | Step 6 merged                               |
| 8    | CHORE-43                           | `fet-chore-auth-contract`       | Step 5 observation period and clean surveys |

The auth readiness follow-up is not a claimed work item yet. Register it in
the chore manifest with a unique name and priority when it becomes next up.
Do not reuse a live branch or claim an item owned by another worktree.

Each implementation gets its own branch off the then-current main and its own PR.
Do not build a chain of unmerged branches. Only the current slice gets a Full Plan;
later slices retain acceptance checklists until their dependencies land.

CHORE-39 merged in PR #102. The PR description preserves its full scope and
verification. CHORE-44 is the next compatibility investigation.

</details>

## Completed first slice

The session boundary changes how our code reads the signed-in user. Auth.js
continues to handle login throughout this slice. There is no schema change,
password copy, new login dependency or mobile feature.

Christian merged PR #102 after the implementer and independent reviewer checked
the changes. Unit, integration, lint and type checks passed.

- A missing session still refuses the action or renders nothing, as it does today.
- Every data read and write receives the session user's identity unchanged.
- The layout retains its display name, email and idle-session values.
- Session reads do not renew or cache the session, or hide provider failures.

The [PR description](https://github.com/Chrisgmsl22/fast-expense-tracker/pull/102)
preserves the file boundary and verification commands.

## Preparation before a database change

The compatibility work resolves technical questions with primary documentation
and isolated local proof. It chooses an exact compatible library version and
records which behavior we tested. We do not add production tables based on an
unverified schema or a library-version assumption.

The recovery work documents what Christian can restore, how long the recovery
window lasts, and how to put the app back into service. It includes a rehearsal
with invented data. An agent never restores or queries the production database.

<details>
<summary>Acceptance checklist for preparation</summary>

- [ ] Verify the selected Better Auth core and OAuth provider versions against
      current official documentation, release dates and the repo's Prisma version.
      ADR-0027 currently requires a 1.7.x release at least two weeks old. If evidence
      conflicts with that constraint, stop for an authorized ADR amendment.
- [ ] Prove legacy bcrypt hashes and short existing passwords work without
      weakening signup's strength rules. Verify mapping to the existing User model
      and UUID identity format.
- [ ] Prove gated signup, the cap and starter-account provisioning remain safe
      through every public provider endpoint. Resolve transaction or retry behavior.
- [ ] Prove explicit idle renewal, passive reads and late renewal races against
      the selected version. Decide how session caching affects revocation.
- [ ] Choose a rollback-safe policy for every password writer, including signup,
      provisioning, seed, change password and manual reset. Prefer proving atomic
      credential mirroring; do not assume a post-write hook gives atomicity.
- [ ] Resolve the conflict between CHORE-33's existing Auth.js brief and spec 0009.
      This plan does not implement CHORE-33. If it lands first, preserve its contract;
      otherwise propose a separate Better Auth brief for it. Do not discard the
      owner's earlier password-change decisions as a side effect of this migration.
- [ ] Document the actual Neon recovery window with an account-specific check
      performed or supplied by Christian. Do not infer it from an advertised plan name.
- [ ] Restore an invented-data backup locally, verify its records, and document
      how deployment configuration and database recovery differ.

</details>

## Web migration

The storage expansion adds auth tables and compatible user fields without
switching login. Its tests compare existing users and financial rows before
and after the migration. The owner can keep the old app running on that schema.

The next slice copies credentials and switches the web. It preserves closed
signup, onboarding, translated errors, idle expiry and logout. We test rollback
after creating an account and changing a password during the transition.

<details>
<summary>Acceptance checklist for the web migration</summary>

- [ ] Expansion changes no financial table, user identity or financial foreign key.
      Existing password hashes stay intact; the old login continues to work.
- [ ] The credential copy runs once per eligible user, inside a transaction,
      and safely repeats. Per-user guards reject missing, duplicate or mismatched
      credentials. Aggregate counts are only supporting evidence.
- [ ] Every password-writing route follows the compatibility policy proven in
      preparation. Rolling back does not lose new accounts or changed passwords.
- [ ] Existing login, logout, signup gate and cap, onboarding, name refresh,
      expiry notices and cross-tab behavior pass automated and real-browser checks.
- [ ] Database-backed rate limiting works across separate server instances.
      State the database-unavailable behavior; do not silently allow requests.
- [ ] The migration runbook includes preflight and post-deploy surveys, rollback
      targets and stop conditions. Production checks belong to Christian.
- [ ] Record the actual production switch date. Start the observation clock
      from that deployment, not a local test or PR creation date.

</details>

## Native authorization and handoff

We first enable the standard native login protocol and verify it with an
invented test client. We then add the smallest protected identity endpoint
needed to prove the server accepts the resulting access credentials.

This establishes the auth contract before the Swift app exists. It does not
require a dashboard or an expense API. Final app identifiers and callbacks
must come from the mobile repo; production registration cannot use placeholders.

<details>
<summary>Acceptance checklist for native authorization</summary>

- [ ] Verify authorization code with S256 PKCE for a public client without a secret.
      Enforce exact redirects, consent policy, supported scopes and discovery metadata.
- [ ] Test wrong verifier, wrong redirect, code reuse and invalid client requests.
      Use a disposable local client and invented users; register production identifiers
      only when the mobile repo supplies them.
- [ ] Settle explicit access and refresh lifetimes and renewal limits. Prove that
      web idle expiry does not unintentionally prevent persistent mobile sign-in.
- [ ] Test refresh rotation, reuse policy, concurrent requests, lost responses,
      explicit logout and password-revocation behavior for the selected version.
- [ ] Choose the token-validation and revocation strategy together. If JWT access
      tokens remain usable until expiry, document and agree on that window before
      claiming all-device revocation. Include signing-key rotation and verification failures.
- [ ] A bounded identity route, tentatively `GET /api/v1/me`, returns only the
      authenticated user's allowed identity fields. It checks signature, issuer,
      audience, expiry and required scopes, and refuses ID tokens or caller-supplied identity.
- [ ] The client contract documents endpoints, error responses, scopes, PKCE,
      callbacks, secure token storage expectations, refresh and revocation behavior.
      Verify an end-to-end token exchange and protected request against that contract.

</details>

## Cleanup after observation

Keep the compatibility storage for at least two weeks of normal production use.
Remove it only when account surveys are clean and recovery is ready. The cleanup
must not remove data that the active app or a supported recovery path still needs.

The mobile repo can begin after the auth handoff while cleanup waits. Christian
chooses when to merge the destructive migration.

## How each slice runs

The main session owns the plan, acceptance criteria and handoffs. An implementer
subagent owns code changes and checks. A fresh reviewer subagent inspects the
actual diff without receiving the implementer's conclusions. Confirmed findings
go back to the implementer, with at most two repair rounds.

After the checks and review pass, we report the result before moving to the next
slice. Commits and pushes require Christian's explicit instruction. Christian
merges; we do not approve or merge PRs or push to main.

## Size and the next checkpoint

The earlier allowance of 6 to 12 focused engineering days remains a rough,
unmeasured estimate for auth and native authorization. It assumes we keep the
proposed provider and find no blocking compatibility issue. It excludes Swift
work, business APIs, owner merge waits and the two-week observation period.

Step 1 is merged. After step 2, we will replace the broad
estimate with slice-level estimates based on the actual compatibility results.
We will not promise a duration for the web switch before that evidence exists.

<details>
<summary>For agents: current state and sources</summary>

Reader: Christian, who will review the sequence and the next compatibility work.

Christian approved the visual design and merged CHORE-39. Start the next slice
from current main after this documentation work lands. The compatibility proof
must not touch production or run alongside a schema migration.

Sources: [spec 0009](../specs/0009-auth-module-better-auth.md),
[execution plan](../roadmap/execution-plan.md),
[chore registry](../roadmap/chores.json),
[CHORE-39 PR](https://github.com/Chrisgmsl22/fast-expense-tracker/pull/102).

This plan refines the auth sequence, not the friend-launch order. The old
execution-plan reference to friend launch is a separate goal. Enabling public
signup is outside this auth migration's scope.

</details>

# Better Auth compatibility findings

Status: local candidate designs tested and independently reviewed.

We are checking Better Auth 1.7.9 as a candidate. Its official release is dated
October 15, so it meets the existing two-week age rule as of October 29.
Release age alone does not establish safety. Before selecting it for production,
we must check applicable advisories and fixes in newer releases.

The next migration must preserve signup provisioning and password rollback.
The current documentation says after hooks run after a transaction commits.
We therefore cannot assume an after hook makes starter data or a mirrored
password write atomic. The local experiment confirmed that behavior on the pinned version.

## Evidence and remaining checks

| Question                  | Documentation evidence                                                                 | Runtime status                                                        |
| ------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Prisma 6 compatibility    | Official adapter guide permits retaining an existing Prisma 6 client setup             | Reduced auth schema passed; full app migration untested               |
| Credential identity       | Current upgrade guide says 1.7.3 removed the short-lived required account issuer field | Generate and inspect the pinned schema before CHORE-40                |
| Account hooks             | Database guide documents hooks for user, session and account                           | Successful mirrors work; injected after-hook failures leave commits   |
| Starter data provisioning | After hooks execute after commit according to current docs                             | Outer-transaction alternative passed with fake starter data           |
| Legacy password login     | Custom bcrypt verification is required by the design                                   | Three-character legacy sign-in passed; short signup refused           |
| Idle behavior             | Existing design requires passive reads without renewal                                 | Guarded live-session renewal passed with global disable retained      |
| Mobile revocation         | Current provider guide distinguishes local JWT validation from server introspection    | Select and test the agreed revocation strategy before native delivery |

Current documentation may describe a newer patch. Findings from docs are not
substitutes for running the selected package. This investigation does not change
an accepted ADR or authorize an application dependency or migration.

## Parallel work

Compatibility evidence and the recovery runbook can proceed independently.
They need different branches/worktrees and separate disposable databases for
any tests. Neither may change the other's plan, files or data.

Schema expansion waits for both. The web switch waits for schema expansion.
Native authorization waits for the working web provider. Independent code
review starts after the reviewed diff stops changing.

## What the first proof established

The local proof shows that a three-character legacy bcrypt password
signs in with the original UUID, while short-password signup is refused. Passive
reads preserve expiry when global session refresh is disabled, but the normal
explicit refresh endpoint is also blocked by that setting.

The local proof also shows that after-hook failures leave signup or credential
updates committed. In particular, a failed password mirror can leave the old
and new hashes different. We must not use that approach as proof of rollback safety.

## Follow-up candidates

An outer application transaction passed the reduced-schema tests. It covered
the library's signup or password change, starter data and legacy password copy.
Injected failures rolled back the whole operation. Public password-writing
routes could be disabled while the controlled server API still worked.

A separate guarded renewal extended only live sessions, bound to the authenticated
user, token and session id. Concurrent and stale requests did not shorten expiry.
This preserves the accepted global automatic-refresh disable setting.

The candidate to carry into implementation design is an application-owned
transaction around credential writes, plus a guarded activity-renewal action.
The full app must prove starter-kit behavior, transaction bounds, route controls
and cookie publication after commit. The SDK accepts the transaction client in
the tested version, but its published types do not establish a supported contract.
App-owned provisioning followed by normal library sign-in is a tested signup
fallback if that integration proves too fragile.

These results narrow the design choices; they do not authorize a production
migration. Before native delivery, refresh/session linkage and replay handling
still need version-specific verification.

<details>
<summary>Sources and experiment evidence</summary>

- [Release 1.7.9](https://github.com/better-auth/better-auth/releases/tag/v1.7.9)
- [Prisma adapter](https://better-auth.com/docs/adapters/prisma)
- [1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide)
- [Database hooks](https://better-auth.com/docs/concepts/database)
- [OAuth provider](https://better-auth.com/docs/plugins/oauth-provider)
- [Experiment results and reproduction](auth-compatibility-experiments.md).
- [Follow-up transaction and renewal evidence](auth-compatibility-followup.md).

</details>

## Review limits

The independent reviewer found no material issue in the reduced-schema evidence.
It inspected pinned source, scripts and saved outputs but did not rerun the database
proof or independently verify database cleanup. Some injected HTTP statuses are
logged rather than asserted; inspect the JSONL as well as the exit code. Preserve
the scratch lockfile when reproducing exact transitive versions.

The follow-up reviewer found no material findings, verified archived artifacts
against the tested originals, and checked script syntax. It inspected assertions,
results and pinned source; it did not rerun the database or browser integration.

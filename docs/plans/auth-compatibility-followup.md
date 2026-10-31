# Auth compatibility follow-up

The outer transaction passed the bounded signup and password tests. Failed provisioning and mirror writes rolled back together with the credential changes. A guarded session update also renewed live sessions while global automatic refresh stayed disabled. These are candidate designs for implementation review, not deployment approval.

## Results

Executed on 2026-10-30 with Better Auth 1.7.9, Prisma Client and CLI 6.19.3, bcryptjs 3.0.3, and bundled Node 24.22.1. Only the new local database fet_auth_followup_179_20261030 received changes. Its fixture rows were cleared, then the database was dropped. The earlier experiment and reproduction remain unchanged.

| Candidate                    | Runtime evidence                                                                                                                                                                                                                   | Limit                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outer transaction for signup | A fresh Better Auth instance used the Prisma transaction client with adapter transaction:false. Signup committed 1 UUID User, 1 credential Account, 1 Session and 1 fake Starter. Both password hashes matched.                    | Reduced schema and fake starter only. No real provisioning repository or Next.js integration.                                                     |
| Signup failure rollback      | Injected failures after starter creation, after the legacy hash copy, and after the library endpoint returned all produced wrapper status 500. No signup rows remained. The test asserted each injected exception's exact message. | The wrapper catches exceptions and assigns 500. This is not an assertion about the raw HTTP router's exception mapping.                           |
| Password rollback            | A successful change retained the User UUID and equal hashes. Failures before the mirror, after the mirror, and after the endpoint returned all left both original hashes intact.                                                   | Covers changePassword only, with the same transaction-scoped instance. Reset and plugin paths were not exercised.                                 |
| HTTP bypass controls         | The 5 configured password-writing paths returned 404 through the HTTP handler. Direct signUpEmail and changePassword still worked inside the wrapper.                                                                              | disabledPaths is an HTTP restriction. It does not prevent another server caller from using auth.api directly.                                     |
| App-owned signup fallback    | A repository-shaped transaction wrote User, Account and Starter, then ordinary library sign-in succeeded after commit. A failure after Starter creation left no rows.                                                              | Signup and sign-in are separate commits. A sign-in failure can leave a provisioned account without a session. Idempotent retry remains necessary. |
| Global refresh disable       | 3 authenticated reads left expiry and updatedAt unchanged and emitted no cookies.                                                                                                                                                  | Live session, cookie cache disabled. Expired reads can clean up the session or cookies.                                                           |
| Guarded renewal              | A live authenticated session extended to the trusted target. Wrong token, session ID or user ID returned candidate status 401. Expired and revoked rows also returned 401.                                                         | Candidate statuses come from the disposable renewal function, not an implemented app endpoint.                                                    |
| Renewal races                | Deletion after authentication but before the update returned 401 and did not recreate the session. 12 concurrent targets ended at the maximum expiry. A stale target could not shorten it.                                         | No browser, distributed clock, cross-tab or deployment tests.                                                                                     |

The transaction client had no $transaction method. Disabling adapter transactions avoided a nested transaction call. The outer Prisma transaction remained open while library after hooks ran, so their writes could still roll back. The earlier result still holds: an ordinary library-owned transaction commits before those after hooks.

## What implementation still needs

- Choose between an outer wrapper and app-owned provisioning. This experiment proves both reduced signup candidates can commit credentials and starter data together. It does not choose the app architecture.
- Keep every password writer behind the approved write path. The tested disabled paths cover signup, change, set, reset and reset-request routes. Direct server APIs, future plugins, admin APIs and custom routes need their own entry-point audit.
- Keep responses and external side effects buffered until commit. The proof held the Response object locally and returned it only after Prisma committed. It did not load nextCookies, send email, call secondary storage or publish a cookie to a browser. None of those effects can be undone by database rollback.
- Bound transaction duration. The proof allowed 15 seconds and performed bcrypt and auth initialization inside the transaction. Production latency, pool use, retries, caps and signup-gate races remain untested. No casts or client extensions were used. The adapter's published PrismaClient parameter is an empty interface, so acceptance by its types alone does not establish a documented transaction-client contract.
- Finish the idle contract. The query uses a server-authenticated identity, a server-chosen expiry target, database time for the expiry guard, and GREATEST to prevent shortening. An app action still needs CSRF and activity checks, cookie renewal after commit, expiry/revocation race policy, throttling, session-lock and browser tests. Client-supplied dates must not become trusted expiry targets.

## Version-specific code inspected

These are paths in the installed 1.7.9 package artifacts, not newer online documentation.

- @better-auth/prisma-adapter/dist/index.mjs: adapter transaction:false does not call Prisma $transaction; the adapter operates on the supplied client.
- @better-auth/prisma-adapter/dist/index.d.mts: the PrismaClient parameter is an empty interface, not a restrictive generated Prisma client type.
- @better-auth/core/dist/context/transaction.mjs: with an adapter that has no real inner transaction, queued after hooks run before the caller's outer transaction scope returns.
- better-auth/dist/api/index.mjs: router onRequest enforces disabledPaths before dispatch.
- better-auth/dist/api/to-auth-endpoints.mjs: direct auth.api calls dispatch endpoints separately from the HTTP router restriction.

<details>
<summary>For agents: commands and exact results</summary>

The [archived artifacts](./auth-compatibility-artifacts/) preserve the exact tested script, schema, manifest and lockfile. Copy all 4 files into a fresh temporary directory and remove only each final .txt suffix. The target names must be followup.mjs, schema.prisma, package.json and pnpm-lock.yaml. Run the commands below from that directory. The script rejects any other host, port or database and clears its own fixture rows before and after execution.

```sh
export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
pnpm install --frozen-lockfile --ignore-scripts
docker exec fast-expense-tracker-db psql -U postgres -c 'CREATE DATABASE fet_auth_followup_179_20261030'
export DATABASE_URL='postgresql://postgres:postgres@localhost:5433/fet_auth_followup_179_20261030'
node node_modules/prisma/build/index.js db push --schema schema.prisma
node followup.mjs > results.jsonl 2> expected-failures.log
docker exec fast-expense-tracker-db psql -U postgres -c 'DROP DATABASE fet_auth_followup_179_20261030'
```

The final run exited 0. expected-failures.log was empty because direct API exceptions were caught by the outer wrapper. The script asserted the intended injected exception messages and statuses. JSON reports contain no hashes, cookies or tokens. Local-only credentials above come from the committed Docker configuration. No environment file was read. The initial offline dependency install could not access a cached tarball; a scoped default-registry install succeeded.

```jsonl
{"test":"http-disabled-paths","paths":["/sign-up/email","/change-password","/set-password","/reset-password","/request-password-reset"],"status":404}
{"test":"outer-signup-success","status":200,"uuid":true,"hashesEqual":true,"starterCount":1,"sessionCount":1,"internalApiIgnoresDisabledPath":true}
{"test":"outer-signup-provision-fail","status":500,"allRowsRolledBack":true}
{"test":"outer-signup-mirror-fail","status":500,"allRowsRolledBack":true}
{"test":"outer-signup-after-endpoint-fail","status":500,"allRowsRolledBack":true}
{"test":"outer-password-success","status":200,"sameUuid":true,"hashesEqual":true,"starterCount":1}
{"test":"outer-password-before-mirror-fail","status":500,"bothHashesRolledBack":true}
{"test":"outer-password-mirror-fail","status":500,"bothHashesRolledBack":true}
{"test":"outer-password-after-endpoint-fail","status":500,"bothHashesRolledBack":true}
{"test":"owned-signup-then-signin","status":200,"starterCount":1,"hashesEqual":true,"sessionAfterCommit":true}
{"test":"owned-signup-failure","status":500,"allRowsRolledBack":true}
{"test":"global-disable-passive","reads":3,"expiryUnchanged":true,"updatedAtUnchanged":true,"noSetCookie":true}
{"test":"guarded-active-renewal","status":200,"expiryExtended":true}
{"test":"guarded-identity-binding","tokenMismatch":401,"idMismatch":401,"userMismatch":401}
{"test":"guarded-concurrent-and-stale","concurrentCalls":12,"status":200,"expiryIsMaximum":true,"staleCallDidNotShorten":true}
{"test":"guarded-revoke-race","status":401,"noResurrection":true}
{"test":"guarded-already-revoked","status":401}
{"test":"guarded-expired","directUpdateStatus":401,"authenticatedRenewalStatus":401,"noResurrection":true}
{"test":"complete","pass":true}
```

</details>

## Archived artifacts

- [Experiment script](./auth-compatibility-artifacts/followup.mjs.txt)
- [Reduced schema](./auth-compatibility-artifacts/schema.prisma.txt)
- [Dependency manifest](./auth-compatibility-artifacts/package.json.txt)
- [Dependency lockfile](./auth-compatibility-artifacts/pnpm-lock.yaml.txt)

Each archived file matches its tested temporary source byte for byte. The exact JSONL results appear above. No runtime cookies, tokens or password hashes are archived.

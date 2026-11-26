# CHORE-45 structured log smoke procedure

This procedure exercises the server logging path without touching production
or writing to a database.

1. Run `pnpm vitest run tests/unit/sentry-config.test.ts tests/unit/sentry-logs-transport.test.ts tests/unit/create-expense.test.ts tests/unit/auth-login.test.ts`.
   These tests use invented inputs and injected fake repositories. The config
   test verifies the event and attribute filter; action tests verify success,
   unexpected failures, expected validation/credential rejection, and unchanged
   results when the telemetry sender throws.
2. For a transport smoke, run the same static event through the Sentry SDK with
   an in-memory mock transport and inspect the serialized log envelope. Assert
   that it contains the static event, level, environment/release SDK metadata,
   and no scope user, request, record, credential, or financial attributes.
   Do not configure a production DSN or use a real account.
3. If end-to-end GlitchTip receipt needs verification, use a separately
   provisioned isolated GlitchTip project and an invented test identity in a
   local controlled process. Keep any DSN in the process environment, never in
   source or output, then remove it after the check. Do not invoke an action
   wired to the real database. Standard Vercel Preview is DB-less; no public
   smoke endpoint is part of this slice.

The approved follow-up for post-rollout production verification uses the
existing production test profile to save one regular expense. That check is
outside this implementation smoke and must not be replaced with real financial
data during development.

# ADR-0012: Integration tests for the DB layer; coverage is advisory

Date: 2026-06-25
Status: Accepted (revises the rollout in [ADR-0011](./0011-test-coverage-policy.md))

## Context

ADR-0011 set a tiered coverage gate (100% logic / 90% components) to flip from
report-only to **blocking** after a backfill. Building that backfill surfaced a
blocking tooling problem:

- The service/action tests `vi.mock("@/lib/db")`. The coverage reporters
  (**both `@vitest/coverage-v8` and `@vitest/coverage-istanbul`**, versions
  aligned) **silently drop executed source modules that import the Prisma
  client** from the report — the file under test reads as absent/0% while
  unrelated walked files show fine. Reproduced across mock/no-mock,
  single/multi-environment, prisma inlined, and with/without `vite-tsconfig-paths`.
  Likely a Vitest 4 + Node 24 + Prisma-module-load interaction.

So a coverage-% gate can't honestly evaluate the DB layer. Mocked DB unit tests
were also low value ("test the mock, not the query").

We also confirmed Neon offers no test "mocks" — only real ephemeral branches —
and using them would reverse ADR-0004 (Neon = prod only). Docker Postgres (local)

- a GitHub Actions Postgres service (CI) is already the ADR-0004 path.

## Decision

1. **Test the DB layer with integration tests against a real Postgres**, not
   mocked unit tests. Anything importing `@/lib/db` (`lib/services/**`,
   DB-touching `app/_actions/**`) gets an integration test in `tests/integration/`
   (node env, real DB, seed → assert, truncate between tests). Mock only the
   session (`@/auth`), never the DB.
2. **Keep unit tests for everything else** (pure logic, schemas, components) in
   `tests/unit/`. Prefer extracting pure logic so it's unit-testable.
3. **Coverage is advisory** (`pnpm test:coverage`, non-blocking). No threshold
   gate — the reporter can't be trusted for Prisma-importing files. Thresholds
   removed from `vitest.config.ts`.
4. **The CI gate is tests passing — unit + integration.** A Postgres service
   container backs integration in CI (ADR-0004's planned Phase-1 addition). The
   DB layer is enforced by its integration tests passing, not by a coverage number.

Operational detail + agent guidance: [`testing.md`](../conventions/testing.md).

## Consequences

**Positive**

- Higher-fidelity DB tests (real queries catch real bugs mocks can't).
- A reliable, honest CI gate (tests pass) instead of a brittle/false coverage %.
- Sidesteps the reporter bug rather than fighting it.

**Negative / tradeoffs**

- Integration tests need a running Postgres (Docker locally; service in CI) and
  are slower than mocked unit tests.
- No enforced coverage **number** — mitigated by the tests-pass gate + the
  "add a test with every new file" convention in `testing.md`.
- Blanket-100% coverage gates are widely considered counterproductive anyway, so
  losing the number is a small cost.

## References

- [ADR-0011](./0011-test-coverage-policy.md) — original tiered policy (rollout revised here).
- [ADR-0004](./0004-db-environment-isolation.md) — Docker local + CI Postgres service.
- `vitest.config.ts` / `vitest.integration.config.ts`, `docs/conventions/testing.md`.
- `docs/lessons.md` (2026-06-25) — the coverage-reporter rabbit hole.

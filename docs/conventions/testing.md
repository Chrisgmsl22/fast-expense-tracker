# Testing Guide

How to write tests here: the unit/integration split, what to test per layer,
patterns, and how coverage is (and isn't) gated. Companion to
[ADR-0011](../decisions/0011-test-coverage-policy.md) (coverage) and
[ADR-0012](../decisions/0012-integration-tests-for-db-layer.md) (integration +
why coverage is advisory). The table in
[`coding-conventions.md`](./coding-conventions.md#testing) still holds.

## Two kinds of test

| Kind            | Runs                                          | Command                 | Covers                                                                                         |
| --------------- | --------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| **Unit**        | `tests/unit/`, jsdom, no DB                   | `pnpm test`             | pure logic (`lib/dates`, `lib/format`, `lib/utils`, `lib/schemas`), components, non-DB actions |
| **Integration** | `tests/integration/`, node, **real Postgres** | `pnpm test:integration` | DB layer — `lib/services/**` and DB-touching `app/_actions/**`                                 |

**The rule of thumb:** if the code (transitively) imports `@/lib/db`, test it
with an **integration** test against a real database. Otherwise, **unit**-test it.

Why: unit-mocking the DB (`vi.mock("@/lib/db")`) gives low-value "test the mock"
assertions, and it triggers a coverage-reporter bug that silently drops those
files (ADR-0011/0012). Integration tests run the real query — higher fidelity —
and instrument cleanly. **Do not `vi.mock("@/lib/db")`.**

Prefer **extracting pure logic** out of DB code into `lib/` helpers (e.g.
`getMonthRangeUtc`, `formatMxn`, the split math) so it can be unit-tested fast;
keep services thin.

## Running

```
# unit (fast, no DB)
pnpm test

# integration (needs the Docker test DB)
pnpm db:up            # start Postgres
pnpm db:test:setup    # create the fast_expense_tracker_test database (once)
pnpm test:integration # globalSetup runs `prisma migrate deploy`, then the suite
```

CI runs both: a Postgres **service container** backs `pnpm test:integration`
(ADR-0004). The test DB is separate from your dev DB, and every integration test
starts from a truncated database (`tests/integration/truncate.ts`).

## What to test, per layer

| Layer                                                  | Kind            | Cover                                                                                                                                          |
| ------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pure util** (`lib/dates`, `lib/format`, `lib/utils`) | unit            | representative values + edge cases (tz boundaries, zero, negatives)                                                                            |
| **Schema** (`lib/schemas/**`)                          | unit            | valid input parses; each invalid field reports; coercion/defaults                                                                              |
| **Component** (`components/**`)                        | unit            | renders core fields, conditional UI, the action is called with the right payload, error + pending states                                       |
| **Service** (`lib/services/**`)                        | **integration** | real query correctness: filtering, scoping (per user), ordering, returned shape, the stored split fields                                       |
| **DB action** (`app/_actions/**` that write/read)      | **integration** | validation rejects without writing; auth guard; happy path persists the right row; each error branch (mock only the **session**, never the DB) |

Every test covers **happy path + each error path + the edge cases you can name** —
not just success.

### What NOT to unit-test

Server components / route files (`app/**/{page,layout,loading,error}.tsx`),
auth/route wiring (`auth*.ts`, `proxy.ts`), config, `prisma/`, `scripts/`,
vendored UI primitives (`components/ui/**`), the Prisma singleton (`lib/db.ts`),
type-only files. Critical user flows are covered by Playwright E2E instead.

## Patterns

- **Unit — mock the layer below:** the action in component tests
  (`vi.mock("@/app/_actions/...")`), `@/auth` in action tests (so next-auth
  never loads). **Never mock `@/lib/db`** — that code gets an integration test.
- **Integration — seed then assert:** create rows via `db`, call the real
  function, assert. Truncation between tests means ids/emails only need to be
  unique within one test.
- **Integration — mock only the session:** `vi.mock("@/auth", () => ({ auth: ... }))`
  with the real `db` (see `tests/integration/expense-create.test.ts`).
- **No `@testing-library/jest-dom`** — assert with plain Vitest (`getBy*`/`findBy*`
  throw if absent; read `el.textContent` / `(el as HTMLButtonElement).disabled`).
- **Async UI:** `await screen.findBy*` / `waitFor`. **Events:** `fireEvent`.
- **Test names:** `Should <expected> when <condition>`.

## Coverage — advisory, not a gate

`pnpm test:coverage` prints a report; **it does not gate CI.** The v8/istanbul
reporters in this environment silently drop executed modules that import the
Prisma client, so the number isn't trustworthy for those files (full story:
[ADR-0011](../decisions/0011-test-coverage-policy.md) +
[lessons.md](../lessons.md)).

**The gate is tests passing — unit + integration — in CI.** That's what enforces
the DB layer (its integration tests must pass) and everything else.

**Agent guidance on line coverage:** treat coverage as a _signal_, not a target
to game. Aim high where it's measured reliably (pure logic, components — push
these toward full coverage). For DB code, the equivalent of "covered" is **a real
integration test exists and passes** — don't chase a coverage % on it or add a
mocked unit test to make a number move. If you add a new source file, add its
test (unit or integration per the rule above); don't rely on the advisory report
to catch a missing one.

## Before opening a PR

1. `pnpm test` green (unit).
2. `pnpm test:integration` green (if you touched the DB layer).
3. `pnpm typecheck` + `pnpm lint` clean.
4. New/changed code has tests covering its branches (error paths included).

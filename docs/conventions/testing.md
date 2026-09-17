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
- **Test names:** a clear phrase describing the behavior under test (descriptive present-tense, e.g. "returns an empty array for a user with no expenses").

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

## The browser pass — required for any FE slice

A green suite is not evidence that a screen is right. Every defect listed under
"What tests keep missing" shipped with its own tests passing. For any slice that
changes what a screen shows, **load the page and read it**.

**Setup, per PR.** Run one dev server per branch on its own port, so two PRs can
be checked side by side: `pnpm -C <worktree> dev --port 3002`.

**Worktree traps that cost an hour if you do not know them:**

- **A worktree has no `.env.local`.** Git does not carry gitignored files into a
  worktree, so a fresh one starts with no `AUTH_SECRET` and no `DATABASE_URL`,
  and every sign-in returns 500. Copy it in:
  `cp -n <primary>/.env.local <worktree>/.env.local`. Copy it — never read,
  print, or commit it. It stays gitignored.
- **Restart the server after that copy.** Next reads env at boot, so a running
  server keeps the broken state.
- **`AUTH_URL` pins the redirect to port 3000.** Signing in on 3002 succeeds and
  then bounces to a dead 3000. The session cookie is host-scoped, not
  port-scoped, so navigate to `localhost:<your port>/dashboard` afterwards.
- **Never point a browser at a worktree another agent is editing** — you are
  looking at a half-written tree.

**Read the whole screen, not the figure you changed.** Check that every number,
label and empty state on the page tells one story. Most defects here are one
element contradicting another, not one element wrong on its own.

## What tests keep missing

Four classes have each produced a real defect **while the suite was green**.
Write the assertion that catches them.

**1. A predicate that does not mirror its read path.** A guard, filter or badge
condition written wider or narrower than the query it must match. Symptoms: a row
counted in one figure and not another; a control that refuses rows the feature
never touched; money in a total with no row to point at.

> Assert that the two sides describe the **same set**, not that they agree on the
> three values you happened to test. If a Prisma `where` says
> `fundedFrom: "income"`, the code-side complement must test the **raw** column,
> not a narrowed enum that collapses unknown values to a valid one.

**2. A screen whose elements contradict each other.** A header reading "shown
below" above a section reading "nothing here"; "1 expense across 0
subcategories"; a `$0` label directly above the row holding the money.

> A test that renders one component proves nothing about the page. Assert across
> the composed page, and assert on the elements you did **not** change — that is
> where the contradiction lives. A test that checks only what it fixed passes
> over the bug still on screen.

**3. A fixture builder that discards the field under test.** A builder that
hardcodes `fundedFrom: "income"` and ignores the caller's override makes every
test on that component structurally blind to the case under test.

> Builders spread the override **last**, or read `over.x ?? default` for every
> field. When you add a field to a type, grep the builders before writing tests
> against it.

**4. A control fixed on one view while its siblings still offer it.** The same
"control that only fails" defect was found on three surfaces in three consecutive
review rounds — an expense row, a movement row, then the settlement Month
journal. Each round fixed the surface in front of it and left the others live.

> When you gate a control or fix a predicate on one view, list every view that
> renders the same row and check each one. A row that carries its own
> locked/disabled fact is safer than a view that remembers to pass a flag — but
> only if every producer of that row actually derives the fact. A hardcoded
> `false` on one producer makes the row lie about itself, and every view that
> trusts it renders a button the server will refuse.

**And: a test that compares a function to itself proves nothing.** Calling a
helper twice with the same input and asserting the two results match passes for
any implementation, correct or broken. Pin real values.

## What a targeted run does and does not prove

`pnpm vitest run <one file>` is fine while iterating. It is **not** evidence for
a PR: it cannot catch a change that breaks a consumer in another file, and it
never touches the DB layer. Report a targeted run as a targeted run, and name the
gates you did not run. Never call a branch green on one.

## Before opening a PR

1. `pnpm test` green (unit) — the **full** suite, not a targeted run.
2. `pnpm test:integration` green (if you touched the DB layer).
3. `pnpm typecheck` + `pnpm lint` clean.
4. New/changed code has tests covering its branches (error paths included).
5. **A browser pass on every screen the slice changes**, per the section above.
6. Any gate you could not run is named in the PR description. An unrun gate is
   not a passing gate.

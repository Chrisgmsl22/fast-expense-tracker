# Testing Guide

How to write tests in this repo: where they live, what to test per layer, the
patterns to follow, and the coverage bar. This is the implementer-facing
companion to the coverage policy in
[ADR-0011](../decisions/0011-test-coverage-policy.md). The high-level testing
table in [`coding-conventions.md`](./coding-conventions.md#testing) still holds;
this doc is the operational detail.

## Where tests live

All tests are centralized under `tests/unit/`, one file per source unit:

```
tests/unit/
├── dates.test.ts          # lib/dates.ts
├── expense-service.test.ts # lib/services/expense/expense.service.ts
├── login-form.test.tsx     # components/auth/LoginForm.tsx
└── page-shells.test.tsx    # server-component shells
```

Naming: `<kebab-source>.test.ts` (logic) / `.test.tsx` (components). Vitest
discovers `tests/**/*.{test,spec}.{ts,tsx}` (`vitest.config.ts`).

## Tooling

- **Vitest** (`pnpm test`) — runner, jsdom environment, globals on.
- **React Testing Library** — component rendering + queries.
- **No `@testing-library/jest-dom`.** Assert with plain Vitest: `getBy*`/`findBy*`
  throw if absent (existence check), and read state off the element
  (`el.textContent`, `(el as HTMLButtonElement).disabled`). Don't reach for
  `toBeInTheDocument`/`toHaveTextContent` — they aren't installed.

## What to test, per layer

Mock the layer directly below the unit under test (per
[`coding-conventions.md`](./coding-conventions.md#testing)):

| Layer                                        | Mock                                    | Cover                                                                                                                      |
| -------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Service** (`lib/services/**`)              | Prisma client (`@/lib/db`)              | happy path, empty result, the month/boundary + split math, error propagation                                               |
| **Server action** (`app/_actions/**`)        | the service it calls                    | validation failure, success shape, each error branch, that it does NOT call the service on invalid input                   |
| **Schema** (`lib/schemas/**`)                | nothing                                 | valid input parses; each invalid field reports; coercion/defaults                                                          |
| **Pure util** (`lib/dates`, `lib/format`, …) | nothing                                 | representative values + edge cases (timezone boundaries, zero, negative)                                                   |
| **Component** (`components/**`)              | the server action / network (`vi.mock`) | renders core fields, conditional UI (shown/hidden), submit calls the action with the right payload, error + pending states |

Every unit covers **happy path + each error path + the edge cases you can name**
— not just the success case.

### What NOT to test

Excluded from coverage (`vitest.config.ts`) — don't write hollow tests for these:
server components / route files (`app/**/{page,layout,loading,error}.tsx`),
auth/route wiring (`auth*.ts`, `proxy.ts`), config, `prisma/`, `scripts/`,
vendored UI primitives (`components/ui/**`), the Prisma client singleton
(`lib/db.ts`), and type-only files. These get exercised by Playwright E2E
(critical paths) instead.

## Patterns

- **Mock the action in component tests:** `vi.mock("@/app/_actions/...", () => ({ action: vi.fn() }))`
  so the component test never loads `next/server`.
- **Async results:** wrap interactions that trigger state updates and assert with
  `await screen.findBy*` / `waitFor` (RTL wraps these in `act`).
- **Events:** `fireEvent.change` / `fireEvent.click` (the repo's existing style).
- **Parameterized cases:** `it.each`. **Partial object match:** `expect.objectContaining`.
- **Test names:** `Should <expected> when <condition>`.
- **Node-only suites:** add `// @vitest-environment node` at the top when a unit
  pulls in server-only modules (see `auth-login.test.ts`).

## Coverage

Run locally / before a PR:

```
pnpm test:coverage
```

Tiered thresholds (the bar — see [ADR-0011](../decisions/0011-test-coverage-policy.md)):

| Scope                                    | Target   |
| ---------------------------------------- | -------- |
| Logic core — `lib/**`, `app/_actions/**` | **100%** |
| Components — `components/**`             | **90%**  |
| Global floor                             | **80%**  |

> **Status: report-only.** CI runs `pnpm test:coverage` non-blocking today. A
> dedicated backfill PR closes the existing gaps and fixes a v8
> multi-environment reporting quirk (mixed jsdom/node suites under-report some
> `lib` files), after which the CI step becomes a blocking gate. Until then,
> ensure **new/changed** code in a layer meets that layer's target.

> **⚠️ TODO — remaining-test work is not "done" until the gate is blocking.**
> The backfill PR MUST, as its final step, **flip CI from report-only to
> blocking** — drop `continue-on-error` from the coverage step in
> [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). Shipping the
> tests without turning the gate on leaves coverage unenforced, which defeats
> the purpose. (Tracked in the roadmap backlog + ADR-0011.)

## Before opening a PR

1. `pnpm test` green.
2. `pnpm test:coverage` — your new/changed code meets its layer's target.
3. Cover every branch you added (error paths included), not just the happy path.

# Coding Conventions

Codebase-specific rules. Tooling-enforced rules (Prettier, ESLint config) are
the source of truth where they conflict with this document.

**Note**: detailed directory structure and stack-specific conventions land
in Phase 0 when the Next.js app is scaffolded. This file captures the rules
already decided; specifics get added per slice.

> **Architecture & frontend rules live in dedicated docs** — read both:
> [`architecture.md`](./architecture.md) (layering, the five principles, the
> data layer) and [`frontend.md`](./frontend.md) (React/Next conventions). This
> file defers to them for those areas.

## TypeScript

- **Strict mode is on** (`tsconfig.json` `strict: true`). Don't disable.
- **No `any` without justification**. If you must, add an inline comment: `// any: <reason>`.
- **Prefer type inference** for locals; explicit return types on exported functions.
- **`interface` vs `type`**:
    - `interface` for object shapes that may be extended.
    - `type` for unions, intersections, derived types (`type ExpenseResponse = ...`).
- **Derive types from Zod schemas**: `type CreateExpenseInput = z.infer<typeof createExpenseSchema>`. Don't restate fields.
- **No implicit `undefined`**: handle the missing-property case explicitly. `tsconfig` enforces this via `noUncheckedIndexedAccess`.
- **No loose `as` casts to paper over a type.** Fix the type at its source instead — e.g. augment third-party types (`types/next-auth.d.ts` adds `Session.user.id`) rather than casting `session.user as { id?: string }`. A cast that asserts a shape the compiler can't see is a code smell a reviewer flags.

## Next.js App Router

- **Server Components by default.** Add `'use client'` only when a component needs interactivity (state, effects, event handlers).
- **Server Actions for mutations.** Co-locate with the page/component that uses them, OR centralize in `app/_actions/` if shared.
- **Route handlers (`route.ts`) only when needed.** Most mutations use Server Actions. Use route handlers for webhooks, API consumers outside Next, or streaming responses.
- **Loading + error boundaries.** Every route segment with async data has a `loading.tsx` and `error.tsx`.
- **No `getServerSideProps` / `getStaticProps`.** Pages Router patterns don't apply here.

## Data layer (Prisma)

See [`architecture.md`](./architecture.md) for the full layering and the five rules. The essentials:

- **Single Prisma client.** Exported from `lib/db.ts`. Never `new PrismaClient()` outside that file — it's **injected** into adapters, not imported by them.
- **All DB access lives behind a repository.** Each aggregate gets an interface in `lib/repositories/<name>.repository.ts`, implemented by a Prisma adapter in the same file. Actions, pages, and route handlers depend on the **interface**, never on `db` directly.
- **Wire concretes at the composition root** (`lib/repositories/index.ts`) and **inject** the repository into callers (default param) so a fake replaces it in unit tests.
- **No direct Prisma calls from components or actions.** Components fetch via a server action or RSC; actions call the repository.
- **Use transactions** for any multi-table write (inside the adapter).
- _Legacy:_ `lib/services/user/` predates this pattern — migrate it to a repository when next touched; don't add new `lib/services/*`.

## Validation

- **All inputs validated with Zod** at the boundary (server action entry, route handler entry, form submission).
- Schemas live in `lib/schemas/<resource>.ts`.
- Use `z.coerce.date()` for dates (forms submit strings).
- Use `.refine()` for cross-field validation.
- Derive types: `type X = z.infer<typeof xSchema>`.

## Error handling

- **Throw structured errors from the data layer (repositories).** Custom error classes in `lib/errors.ts`:
    - `ValidationError` (400)
    - `AuthenticationError` (401)
    - `NotFoundError` (404)
    - `ConflictError` (409)
    - `AppError` (abstract base, don't throw directly)
- **Never throw bare `Error`** from data-layer code. Pick a class.
- **Server actions return the shared `ActionResult`** from [`lib/actions/result.ts`](../../lib/actions/result.ts) — never a bespoke shape. It's `{ ok: true, data } | { ok: false, code, message, fieldErrors? }`:
    - **`code`** is a per-action string-literal union (e.g. `"validation" | "unauthenticated" | "db_error"`). Callers branch on `code`, **never** on `message` strings.
    - **`message`** is the human-facing text.
    - **`fieldErrors`** is `FieldErrors<TInput>` — keyed to the action's input type (`Partial<Record<keyof TInput, string[]>>`), not `Record<string, string[]>`, so a wrong field name is a compile error.
    - Wrap **every** DB touch in the action in one `try/catch` → return `{ ok:false, code:"db_error", … }`; a thrown action = silent failure in the client. Reserve thrown errors for truly unexpected failures.
- **Components don't catch errors directly.** Use `error.tsx` boundaries.

## Auth

- **Auth.js (Credentials provider).** All auth decisions live in `auth.config.ts` and `auth.ts`.
- **`auth()` in Server Components** to read the session.
- **Middleware (`middleware.ts`)** protects routes. Whitelist `/login` and `/api/auth/*`; block everything else.
- **Never read session in client components directly.** Pass `user`/`session` as a prop from a server component, OR use `useSession()` from `next-auth/react` (only when interactivity needs it).
- **Hash passwords with bcrypt** (or argon2 — decide in the auth ADR).

## Security

These rules are non-negotiable. The repo is public.

- **No secrets in code.** All read from `process.env`.
- **No secrets in logs.** Use `[REDACTED]` or omit.
- **No secrets in error messages** returned to the client.
- **Always validate redirect URLs** (open-redirect prevention) if auth flow uses them.
- **CSRF**: Auth.js handles it; don't bypass with raw fetch from client to server actions that change state.
- **Rate-limit login** (Phase 2 will add this — vercel/edge or upstash/ratelimit).
- **Observability env vars** ([ADR-0014](../decisions/0014-glitchtip-replaces-sentry.md)):
  `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` are the GlitchTip DSN — **publishable,
  not secret** (it ships in the client bundle by design); placeholders in
  `.env.example`. The SDK is **inert when unset**. `SENTRY_AUTH_TOKEN`
  (source-map upload) **is** a secret — Vercel env only, never the repo, never
  logged; deferred in v1.

## Testing

> Full operational guide — the unit/integration split, what to test per layer,
> patterns, and how coverage is reported (advisory) — is in [`testing.md`](./testing.md).
> Decisions: [ADR-0011](../decisions/0011-test-coverage-policy.md) (coverage) +
> [ADR-0012](../decisions/0012-integration-tests-for-db-layer.md) (integration).
> Summary below.

**Layout**: `tests/unit/` (pure logic + components, no DB — `pnpm test`) and
`tests/integration/` (DB layer, real Postgres — `pnpm test:integration`).
One file per source unit; `<kebab-source>.test.ts` / `.test.tsx`.

**Unit vs integration**: a **repository adapter** (imports `@/lib/db`) →
**integration** test against a real DB (**never `vi.mock("@/lib/db")`**). An
**action** is unit-tested by **injecting a fake repository** (no `db` import, no
db mock); its real-db path stays integration-covered via the default wiring.
Everything else (pure logic, schemas, components) → **unit**.

**Coverage**: advisory only (`pnpm test:coverage`, non-blocking) — the reporter
unreliably drops Prisma-importing files (ADR-0011/0012). **The gate is tests
passing — unit + integration.**

**Mocking** (unit): replace the layer directly below — the action in component
tests; in action tests **inject a fake repository** and mock `@/auth`. The DB
layer is never mocked; the repository adapter is integration-tested.

**Tools**:

- **Vitest** for unit + integration tests.
- **Playwright** for E2E smoke tests on critical paths (login, create expense, dashboard renders).
- **React Testing Library** for component tests.

**Patterns**:

- `it.each` for parameterized scenarios.
- `expect.objectContaining()` for partial assertions.
- Test names: `Should <expected> when <condition>`.

## Naming

| What                    | Convention                                                           | Example                                        |
| ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Component               | `PascalCase`                                                         | `ExpenseForm`, `DashboardChart`                |
| Server Component file   | `kebab-case.tsx` in `app/` (Next.js convention)                      | `expenses/page.tsx`                            |
| Reusable component file | `PascalCase.tsx` in `components/`                                    | `components/ExpenseForm.tsx`                   |
| Repository              | `<name>.repository.ts` (interface + Prisma adapter)                  | `expense.repository.ts`                        |
| Schema                  | `<resource>.schema.ts` exporting `createXSchema`, etc.               | `expense.schema.ts`                            |
| Test file               | `<source>.test.ts` in `tests/unit` or `tests/integration`            | `expense-repository.test.ts`                   |
| Type file               | `types/<domain>.ts`                                                  | `types/expense.ts`                             |
| Repository interface    | `<Name>Repository` (no `I` prefix); adapter `Prisma<Name>Repository` | `ExpenseRepository`, `PrismaExpenseRepository` |
| Derived type            | `<Name>` (no `I` prefix)                                             | `ExpenseResponse`, `CreateExpenseInput`        |

## REST conventions (for route handlers when used)

- **Plural resource paths**: `/api/expenses`, `/api/categories`.
- **HTTP verbs imply actions** — never `/api/expenses/create`.
- **Response envelope**: `{ success: boolean, message: string, data: T }`.
- **Empty responses**: `new Response(null, { status: 204 })` for successful deletes.

But: prefer **Server Actions over route handlers** for mutations from the
client. Route handlers exist for external API consumers, webhooks, or
streaming responses.

## File organization

Locked in Phase 0 once the scaffold lands. Initial proposal:

```
fast-expense-tracker/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Route group: login flow
│   ├── (dashboard)/              # Route group: authenticated app
│   │   ├── expenses/
│   │   ├── categories/
│   │   └── page.tsx              # Dashboard root
│   ├── api/                      # Route handlers (auth callbacks only)
│   ├── _actions/                 # Server actions shared across routes
│   ├── layout.tsx
│   └── globals.css
├── components/                   # Reusable React components
│   ├── ui/                       # shadcn/ui generated components
│   └── ...                       # App-specific composites
├── lib/
│   ├── db.ts                     # Prisma client singleton
│   ├── auth.ts                   # Auth.js setup
│   ├── errors.ts                 # Custom error classes
│   ├── services/                 # Business logic + DB access
│   │   └── <resource>/
│   └── schemas/                  # Zod schemas
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── tests/                        # Playwright E2E tests
├── types/                        # Cross-cutting type definitions
├── docs/                         # See docs/ structure
└── .claude/agents/               # Subagent definitions
```

## Comments

Comments are a maintenance cost — they rot, they drift from the code, they add
noise. Write one only when it earns its place. The code itself, through clear
names and simple structure, is the primary documentation.

- **Default to no comment.** If a comment only restates what the code plainly
  does, delete it. `// Login page` above `LoginPage` is noise.
- **Comment the _why_, not the _what_.** A comment earns its place when it
  explains non-obvious logic, a subtle constraint, or a decision the code can't
  express itself — e.g. "the disabled button has `pointer-events: none`, so the
  wrapper carries the tooltip." If the _what_ is hard to follow, first try to
  make the code clearer; reach for a comment only when it genuinely can't be.
- **A self-evident block needs no comment — not even a _why_.** If a competent
  reader gets it from the names plus a few lines of body, skip the comment.
  Thin wrappers and one-liners don't earn a docblock just because a sentence
  _can_ be written — e.g. a logout action that is only
  `await signOut({ redirectTo: "/login" })` needs nothing. The test: does the
  comment tell the reader something the code doesn't? If no, delete it. A
  comment phrased as "why" that a reader would already infer is still noise.
- **No slice tags, step numbers, or banners.** Never `// (slice 1.3)`,
  `// Step 1:`, or `// === Section ===`. Slice provenance lives in git history
  and PRs, not the source. (Linking an ADR for a non-obvious decision is fine —
  that's a _why_.)
- **Incomplete work uses a marker, not prose** — and the marker is temporary:
    - `TODO:` — work still to do, scoped where possible (`// TODO(1.6): wire edit action`).
    - `FIXME:` — a known defect to fix.
    - When the slice that completes the work lands, the marker **must be resolved
      or removed**. A finished feature must never ship with a `TODO`/`FIXME` that
      points at itself — a stale marker is a review finding.

Both roles apply this: the `implementer` writes to it; the `reviewer` treats
comment quality as an explicit lens and challenges every comment in a diff —
needed, or noise?

## Formatting

- **Prettier** (`.prettierrc.json` at root): defaults, **4-space indent**.
- **ESLint**: Next.js preset (`eslint-config-next`) — `core-web-vitals` + `typescript`.
- Both run on staged files via a **Husky + lint-staged** pre-commit hook (ADR-0006); the hook also runs a project-wide `tsc --noEmit`.
- **Opt-out**: `git commit --no-verify` skips the hook — rare human cases only. Agents must never use `--no-verify` (CLAUDE.md rule #12); fix the failing hook.
- To disable a rule, add an inline comment with a reason: `// eslint-disable-next-line <rule> -- reason: <why>`.
- **Markdown docs**: keep them small — soft size caps per doc type + split strategy in [`doc-structure.md`](./doc-structure.md), warned (non-blocking) at pre-commit.

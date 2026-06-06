# Coding Conventions

Codebase-specific rules. Tooling-enforced rules (Prettier, ESLint config) are
the source of truth where they conflict with this document.

**Note**: detailed directory structure and stack-specific conventions land
in Phase 0 when the Next.js app is scaffolded. This file captures the rules
already decided; specifics get added per slice.

## TypeScript

- **Strict mode is on** (`tsconfig.json` `strict: true`). Don't disable.
- **No `any` without justification**. If you must, add an inline comment: `// any: <reason>`.
- **Prefer type inference** for locals; explicit return types on exported functions.
- **`interface` vs `type`**:
    - `interface` for object shapes that may be extended.
    - `type` for unions, intersections, derived types (`type ExpenseResponse = ...`).
- **Derive types from Zod schemas**: `type CreateExpenseInput = z.infer<typeof createExpenseSchema>`. Don't restate fields.
- **No implicit `undefined`**: handle the missing-property case explicitly. `tsconfig` enforces this via `noUncheckedIndexedAccess`.

## Next.js App Router

- **Server Components by default.** Add `'use client'` only when a component needs interactivity (state, effects, event handlers).
- **Server Actions for mutations.** Co-locate with the page/component that uses them, OR centralize in `app/_actions/` if shared.
- **Route handlers (`route.ts`) only when needed.** Most mutations use Server Actions. Use route handlers for webhooks, API consumers outside Next, or streaming responses.
- **Loading + error boundaries.** Every route segment with async data has a `loading.tsx` and `error.tsx`.
- **No `getServerSideProps` / `getStaticProps`.** Pages Router patterns don't apply here.

## Data layer (Prisma)

- **Single Prisma client.** Exported from `lib/db.ts`. Never `new PrismaClient()` outside that file.
- **All DB access lives in services.** Pages, components, and route handlers call services. Services call Prisma.
- **Services are pure TypeScript modules.** Located in `lib/services/<resource>/`. One folder per resource.
- **No direct Prisma calls from components.** If a component needs data, fetch via a server action or RSC data-fetching in the page.
- **Use transactions** for any multi-table write.

## Validation

- **All inputs validated with Zod** at the boundary (server action entry, route handler entry, form submission).
- Schemas live in `lib/schemas/<resource>.ts`.
- Use `z.coerce.date()` for dates (forms submit strings).
- Use `.refine()` for cross-field validation.
- Derive types: `type X = z.infer<typeof xSchema>`.

## Error handling

- **Throw structured errors from services.** Custom error classes in `lib/errors.ts`:
    - `ValidationError` (400)
    - `AuthenticationError` (401)
    - `NotFoundError` (404)
    - `ConflictError` (409)
    - `AppError` (abstract base, don't throw directly)
- **Never throw bare `Error`** from service code. Pick a class.
- **Server actions return discriminated unions** for expected errors: `{ ok: true, data } | { ok: false, error }`. Reserve thrown errors for unexpected failures.
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

## Testing

**Layout**: tests co-located with source.

```
lib/services/expense/
├── expense.service.ts
└── expense.service.test.ts
```

**Mocking**:

| Testing       | Mock                                             |
| ------------- | ------------------------------------------------ |
| Service       | Prisma client (lowest layer)                     |
| Server action | The service                                      |
| Component     | Server-fetched data via prop, or MSW for network |

**Tools**:

- **Vitest** for unit + integration tests.
- **Playwright** for E2E smoke tests on critical paths (login, create expense, dashboard renders).
- **React Testing Library** for component tests (where used).

**Patterns**:

- `it.each` for parameterized scenarios.
- `expect.objectContaining()` for partial assertions.
- Test names: `Should <expected> when <condition>`.

## Naming

| What                    | Convention                                                   | Example                                 |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------- |
| Component               | `PascalCase`                                                 | `ExpenseForm`, `DashboardChart`         |
| Server Component file   | `kebab-case.tsx` in `app/` (Next.js convention)              | `expenses/page.tsx`                     |
| Reusable component file | `PascalCase.tsx` in `components/`                            | `components/ExpenseForm.tsx`            |
| Service                 | `<resource>.service.ts`                                      | `expense.service.ts`                    |
| Schema                  | `<resource>.schema.ts` exporting `createXSchema`, etc.       | `expense.schema.ts`                     |
| Test file               | `<source>.test.ts` next to source                            | `expense.service.test.ts`               |
| Type file               | `types/<domain>.ts`                                          | `types/expense.ts`                      |
| Interface               | `I<Name>` for service contracts (optional, only when useful) | `IExpenseService`                       |
| Derived type            | `<Name>` (no `I` prefix)                                     | `ExpenseResponse`, `CreateExpenseInput` |

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

## Formatting

- **Prettier** (`.prettierrc.json` at root): defaults, **4-space indent**.
- **ESLint**: Next.js preset (`eslint-config-next`) — `core-web-vitals` + `typescript`.
- Both run on staged files via a **Husky + lint-staged** pre-commit hook (ADR-0006); the hook also runs a project-wide `tsc --noEmit`.
- **Opt-out**: `git commit --no-verify` skips the hook — rare human cases only. Agents must never use `--no-verify` (CLAUDE.md rule #12); fix the failing hook.
- To disable a rule, add an inline comment with a reason: `// eslint-disable-next-line <rule> -- reason: <why>`.
- **Markdown docs**: keep them small — soft size caps per doc type + split strategy in [`doc-structure.md`](./doc-structure.md), warned (non-blocking) at pre-commit.

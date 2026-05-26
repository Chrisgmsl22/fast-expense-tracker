# Phase 0: Bootstrap

**Status**: ⚪ Not started
**Outcome**: Empty Next.js app live on Vercel; CI green; Prisma schema scaffolded.
**Spec**: [`docs/specs/0001-initial-design.md` §7 — Phase 0](../specs/0001-initial-design.md)
**Slicing**: [`parallel-slicing.md`](../conventions/parallel-slicing.md) — F→Fan-out

This phase is pure infrastructure. No user-facing feature ships. Success
looks like: clone the repo, run `pnpm install && pnpm dev`, see the app
locally. Push a branch, CI runs green. Merge to `main`, Vercel deploys.

Phase 0 has **no Integration slice** because the work is pure
infrastructure — "feature works end-to-end" isn't applicable. Vercel
preview URLs loading + CI green from 0.2/0.3 serve as integration
verification.

## Prerequisites (manual)

Complete the relevant sections of [`docs/operations/setup.md`](../operations/setup.md) **before invoking the `implementer`** on each slice:

- Before **0.1** — §1 (local dev environment) and §2 (Neon database + `DATABASE_URL`)
- Before **0.2** — §3 (Vercel project + env vars)
- Before **0.3** — no new prereqs
- Before **0.4** — no new prereqs
- *After* **0.3** ships — §4 (GitHub branch protection on `main`)

## Slices

#### 0.1: Next.js + TS-strict + Tailwind + shadcn/ui + Prisma + Neon scaffold `[PR]`

**Type**: Foundation
**Depends on**: —

Lays down the entire base stack so subsequent slices have something to
attach to. Includes the initial empty Prisma migration.

##### Plan

**Scope (in)**

- `package.json` initialized with pnpm + Node 20.x LTS pinned in `engines`
- Next.js 15 with App Router (`app/` directory; no Pages Router)
- TypeScript strict mode in `tsconfig.json` — `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- Tailwind CSS configured (`tailwind.config.ts`, `app/globals.css`)
- shadcn/ui initialized (`components.json`); install **only `Button`** as a smoke check that the CLI path works
- Prisma installed; `prisma/schema.prisma` with Postgres datasource + **empty** model section
- `lib/db.ts` Prisma client singleton per [`coding-conventions.md §Data layer`](../conventions/coding-conventions.md)
- `.env.example` with `DATABASE_URL=""` + a one-line comment explaining what it is
- Root layout (`app/layout.tsx`) + placeholder home page (`app/page.tsx`) — bare scaffolding, no auth, no nav
- `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (Vitest), `db:generate`, `db:migrate`
- Vitest installed + minimal `vitest.config.ts`; one smoke test that the root page renders
- Baseline Prisma migration committed to `prisma/migrations/` (creates `_prisma_migrations` table only)

**Scope (out)**

- Vercel deployment (→ slice 0.2)
- GitHub Actions CI + `.env*` grep guard (→ slice 0.3)
- Pre-commit hook + Husky-vs-lefthook decision (→ slice 0.4)
- Auth.js installation + config (→ slice 1.3)
- Actual Prisma models (User, Category, Expense, etc.) (→ slice 1.1)
- Seed script (→ slice 1.2)
- Playwright skeleton (→ slice 0.3)
- Any `.env.example` entries other than `DATABASE_URL` (later slices add their own vars)

**Design decisions**

- **Package manager**: pnpm (matches `implementer.md`'s commands).
- **Node version**: pin `"engines": { "node": ">=20 <21" }` (Node 20 LTS).
- **Project structure**: follow [`coding-conventions.md §File organization`](../conventions/coding-conventions.md) initial proposal — `app/`, `components/`, `lib/`, `prisma/`, `tests/`, `types/`.
- **TypeScript strict**: enable `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. Other flags follow Next.js defaults.
- **Tailwind**: defaults; no custom theme yet. Later slices extend as needed.
- **shadcn/ui**: initialize via CLI; install only `Button` to verify the path. Other components added JIT per slice.
- **Prisma**: Postgres provider; client generated to default location; singleton in `lib/db.ts` (the standard Next.js dev-hot-reload-safe pattern using `globalThis.prisma`).
- **Migration baseline**: empty model section. Migration name: `init`. First real models land in slice 1.1.
- **ESLint**: Next.js preset only for this slice (`next/core-web-vitals`). Custom rules deferred — add via ADR if needed.
- **Vitest config**: `environment: 'node'` by default; component tests in later slices opt into `jsdom` per-file.

**Acceptance criteria**

- `pnpm install` completes without errors
- `pnpm dev` starts and serves a placeholder at `http://localhost:3000`
- `pnpm lint` → 0 errors
- `pnpm typecheck` → 0 errors
- `pnpm test` runs the smoke test (root page renders) and passes
- `pnpm prisma migrate dev --name init` runs against the configured Neon `DATABASE_URL` and creates the `_prisma_migrations` table
- `lib/db.ts` exports a Prisma client singleton (verified: importing twice in dev does not create a second client)
- `.env.example` exists with `DATABASE_URL=""` placeholder
- After running migrations, `git status` shows **no** `.env*` files other than `.env.example`
- All `package.json` scripts execute without error
- `tsconfig.json` has `strict: true` and `noUncheckedIndexedAccess: true`

**Open questions**

- **Tailwind v3 vs v4?** Tailwind v4 (released early 2026) introduces CSS-first config — but shadcn/ui's compatibility may lag. Implementer: check shadcn/ui's docs at time of slice; if v4 is fully supported by shadcn, use it; otherwise pin v3.x. Document the choice in PR description. Not worth an ADR — note in PR is sufficient.

##### Tasks

- [ ] Initialize `package.json` with pnpm + Node 20 in `engines`
- [ ] Scaffold Next.js 15 App Router (`pnpm create next-app` or manual)
- [ ] Configure `tsconfig.json` with strict + `noUncheckedIndexedAccess` + `noImplicitOverride`
- [ ] Install + configure Tailwind CSS (decide v3 vs v4 per open question)
- [ ] Install + initialize shadcn/ui CLI; install only `Button` component
- [ ] Install Prisma + `@prisma/client`; create `prisma/schema.prisma` with empty model section
- [ ] Run `pnpm prisma migrate dev --name init` against Neon (requires `DATABASE_URL` in `.env.local`)
- [ ] Create `lib/db.ts` Prisma client singleton (hot-reload-safe pattern)
- [ ] Add `.env.example` with `DATABASE_URL=""` placeholder
- [ ] Create `app/layout.tsx` and `app/page.tsx` placeholder
- [ ] Add `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`
- [ ] Install Vitest + minimal `vitest.config.ts`
- [ ] Write smoke test: root page renders without error
- [ ] Verify `pnpm dev` serves placeholder
- [ ] Verify `pnpm lint`, `pnpm typecheck`, `pnpm test` all green
- [ ] Confirm `git status` shows no `.env*` files (other than `.env.example`)

---

#### 0.2: Vercel deploy hookup `[PR]`

**Type**: Parallel (with 0.3, 0.4)
**Depends on**: 0.1

Connects the GitHub repo to Vercel and verifies preview + production
deploys both work. Documents the deploy process for future contributors.

##### Tasks

- [ ] Connect repo to Vercel via dashboard
- [ ] Configure env vars in Vercel project settings (`DATABASE_URL`)
- [ ] Verify preview deploy on a feature branch
- [ ] Verify production deploy on merge to `main`
- [ ] Document the deploy process briefly in `docs/conventions/` if needed

---

#### 0.3: GitHub Actions CI `[PR]`

**Type**: Parallel (with 0.2, 0.4)
**Depends on**: 0.1

Wires up the CI pipeline so every PR runs lint + typecheck + tests +
secret-leak guard.

##### Tasks

- [ ] Add `.github/workflows/ci.yml`
- [ ] CI job: `pnpm install` → lint → typecheck
- [ ] CI job: Vitest run (will be empty initially — that's fine)
- [ ] CI job: Playwright skeleton (one trivial test, just to verify wiring)
- [ ] CI job: grep guard that fails if any `.env*` file (other than `.env.example`) appears in the diff (per ADR-0003)
- [ ] Verify CI runs on a sample PR

---

#### 0.4: Pre-commit hook `[PR]`

**Type**: Parallel (with 0.2, 0.3)
**Depends on**: 0.1

Resolves the **Husky vs lefthook** open question (per ADR-0001). Add the
hook so pre-commit runs lint + format + typecheck on staged files.

##### Tasks

- [ ] Decide Husky vs lefthook (write ADR with rationale)
- [ ] Install + configure chosen tool
- [ ] Hook runs Prettier + ESLint on staged files
- [ ] Hook runs `tsc --noEmit` (typecheck) — fast on small diffs
- [ ] Verify hook fires on a sample commit
- [ ] Document opt-out (rare cases) in the convention doc if applicable

# Phase 0: Bootstrap

**Status**: 🟡 In progress — 0.1 + 0.2 shipped; **0.3 active**; 0.4 after
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
- _After_ **0.3** ships — §4 (GitHub branch protection on `main`)

## Slices

#### 0.1: Next.js + TS-strict + Tailwind + shadcn/ui + Prisma + Neon scaffold `[PR]`

**Type**: Foundation
**Depends on**: —
**Status**: 🟢 Shipped on `feat/0.1-bootstrap`. Plan block → PR description.

Lays down the entire base stack so subsequent slices have something to
attach to. Includes the initial empty Prisma migration.

##### Tasks

- [x] Initialize `package.json` with pnpm + Node 24 in `engines` (`.nvmrc` already pins `24`)
- [x] Scaffold Next.js 15 App Router (`pnpm create next-app` or manual)
- [x] Configure `tsconfig.json` with strict + `noUncheckedIndexedAccess` + `noImplicitOverride`
- [x] Install + configure Tailwind CSS (decide v3 vs v4 per open question)
- [x] Install + initialize shadcn/ui CLI; install only `Button` component
- [x] Install Prisma + `@prisma/client`; create `prisma/schema.prisma` with empty model section
- [x] Run `pnpm prisma migrate dev --name init` against Neon (requires `DATABASE_URL` in `.env.local`)
- [x] Create `lib/db.ts` Prisma client singleton (hot-reload-safe pattern)
- [x] Add `.env.example` with `DATABASE_URL=""` placeholder
- [x] Create `app/layout.tsx` and `app/page.tsx` placeholder
- [x] Add `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`
- [x] Install Vitest + minimal `vitest.config.ts`
- [x] Write smoke test: root page renders without error
- [x] Verify `pnpm dev` serves placeholder
- [x] Verify `pnpm lint`, `pnpm typecheck`, `pnpm test` all green
- [x] Confirm `git status` shows no `.env*` files (other than `.env.example`)

---

#### 0.2: Vercel deploy + Neon DB environment isolation `[PR]`

**Type**: Parallel (with 0.3, 0.4)
**Depends on**: 0.1
**Status**: 🟢 Shipped (PR #3) + deploy-verified. Plan → PR description.

Connects the GitHub repo to Vercel and sets up **per-environment database
separation**: Neon holds real data only (one `production` branch); local + CI
run Docker Postgres; preview deploys are build-only. Scope expanded from the
original "Vercel deploy hookup" — see [ADR-0004](../decisions/0004-db-environment-isolation.md).
The interim Neon-integration + preview-branch approach was tried and dropped
(see `docs/lessons.md` 2026-05-31).

##### Tasks

- [x] _(manual)_ Create the Vercel project + connect the GitHub repo; verify production deploy
- [x] Add `docker-compose.yml` (Postgres 17) + `db:up`/`db:down` scripts
- [x] Standardize env vars to `DATABASE_URL` + `DATABASE_URL_UNPOOLED` (`schema.prisma`, `.env.example`)
- [x] Write ADR-0004 (DB isolation) + `docs/conventions/deployment.md`
- [x] Verify local Docker flow: `pnpm db:up` → `cp .env.example .env.local` → `pnpm db:migrate` (verified: `init` applies to local Docker on :5433)
- [x] _(manual)_ Disconnect the Neon-Vercel integration
- [x] _(manual)_ Delete Neon `dev`, `vercel-dev`, and any `preview/*` branches (keep only `production`)
- [x] _(manual)_ Set `DATABASE_URL` + `DATABASE_URL_UNPOOLED` in Vercel (Production scope) from the `production` branch
- [x] _(manual)_ Set Vercel build command: `if [ "$VERCEL_ENV" = "production" ]; then prisma migrate deploy; fi && next build`
- [x] _(manual)_ Verify a production deploy is green with migrations applied (PR #3 deploy `READY`; build log shows `migrate deploy`)

---

#### 0.3: GitHub Actions CI `[PR]`

**Type**: Parallel (with 0.2, 0.4)
**Depends on**: 0.1
**Status**: 🟢 Shipped on `feat/0.3-ci` (PR #6) + CI-verified green. Plan block → PR description.

Wires up the CI pipeline so every PR runs lint + typecheck + tests + secret guards.

##### Tasks

- [x] Add `.github/workflows/ci.yml` (pnpm + Node 24, cached)
- [x] `quality` job: `pnpm install --frozen-lockfile` → lint → typecheck → `pnpm test`
- [x] `.env*` filename guard (fail if any tracked env file other than `.env.example`, per ADR-0003)
- [x] gitleaks secret-value scan (`gitleaks/gitleaks-action@v2`)
- [x] Postgres service container — documented-intent comment only (deferred to Phase 1)
- [x] Verify CI runs green on a sample PR — PR #6, both jobs green

---

#### 0.4: Pre-commit hook `[PR]`

**Type**: Parallel (with 0.2, 0.3)
**Depends on**: 0.1
**Status**: 🟢 Shipped on `feat/0.4-precommit`. Husky + lint-staged chosen (ADR-0006). Plan block → PR description.

Resolves the **Husky vs lefthook** open question (per ADR-0001). Add the
hook so pre-commit runs lint + format + typecheck on staged files.

##### Tasks

- [x] Decide Husky vs lefthook (write ADR with rationale) — ADR-0006: Husky + lint-staged
- [x] Install + configure chosen tool
- [x] Hook runs Prettier + ESLint on staged files
- [x] Hook runs `tsc --noEmit` (typecheck) — project-wide, in the hook
- [x] Verify hook fires on a sample commit
- [x] Document opt-out (rare cases) in the convention doc if applicable

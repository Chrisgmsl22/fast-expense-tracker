# Phase 0: Bootstrap

**Status**: 🟡 In progress (slice 0.1 shipped on `feat/0.1-bootstrap`; 0.2 / 0.3 / 0.4 remaining)
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

**Carry-over from 2026-05-27 harness audit**: when this slice promotes to active and the Plan block is drafted, decide whether to add a secret-**value** scanner (e.g., `gitleaks`) in addition to the `.env*` filename grep. The filename grep only catches accidentally staged env files; a value scanner catches real connection strings / API keys pasted into code or fixtures. Record the decision in the Plan block.

##### Tasks

- [ ] Add `.github/workflows/ci.yml`
- [ ] CI job: `pnpm install` → lint → typecheck
- [ ] CI job: Vitest run (will be empty initially — that's fine)
- [ ] CI job: Playwright skeleton (one trivial test, just to verify wiring)
- [ ] CI job: grep guard that fails if any `.env*` file (other than `.env.example`) appears in the diff (per ADR-0003)
- [ ] Decide on `gitleaks`/equivalent secret-value scanner per audit note above; add to CI workflow if accepted
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

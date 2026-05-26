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

## Slices

#### 0.1: Next.js + TS-strict + Tailwind + shadcn/ui + Prisma + Neon scaffold `[PR]`

**Type**: Foundation
**Depends on**: —

Lays down the entire base stack so subsequent slices have something to
attach to. Includes the initial empty Prisma migration.

##### Tasks

- [ ] Initialize Next.js 15 with App Router, TypeScript `strict: true`
- [ ] Configure Tailwind CSS
- [ ] Install + initialize shadcn/ui (CLI, base components only)
- [ ] Install Prisma; create empty `schema.prisma` with Neon Postgres datasource
- [ ] Run baseline migration (creates `_prisma_migrations` table only)
- [ ] Create `lib/db.ts` Prisma client singleton (per coding-conventions §Data layer)
- [ ] Add `.env.example` with `DATABASE_URL` placeholder (no real values)
- [ ] Verify `pnpm dev` runs locally and Prisma can `connect`
- [ ] Add basic `app/layout.tsx`, root `app/page.tsx` placeholder
- [ ] Tests: smoke test that the root page renders

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

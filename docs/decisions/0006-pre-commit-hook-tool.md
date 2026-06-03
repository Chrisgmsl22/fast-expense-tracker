# ADR-0006: Pre-commit Hook Tool — Husky + lint-staged

Date: 2026-06-02
Status: Accepted

## Context

ADR-0001 deferred the pre-commit hook tool choice ("Husky vs lefthook") to
Phase 0. Slice 0.4 resolves it. The goal: every commit runs Prettier + ESLint
on staged files and a project-wide typecheck, so unformatted, lint-failing, or
type-broken code never lands locally — a fast first line of defense ahead of CI
(0.3).

The repo is **agent-led and public**. Tooling should be the JS-ecosystem
standard so it's instantly legible to any reviewer and to future agents, and so
the codebase reads like a conventional Next.js project.

Options considered:

1. **Husky + lint-staged** — the de-facto standard in the npm/pnpm world. Husky
   manages git hooks; lint-staged scopes linters/formatters to staged files.
   Two devDeps. Ubiquitous, heavily documented.
2. **lefthook** — single Go binary, YAML config, parallel command execution,
   built-in staged-file globbing (no separate lint-staged). Technically leaner
   in some ways (one tool, faster) but less common in JS repos.

## Decision

**Husky + lint-staged.**

- `husky` v9 manages the git hook (`.husky/pre-commit`), wired on install via a
  `prepare: husky` script.
- `lint-staged` runs on staged files:
    - `*.{ts,tsx}` → `eslint --fix` then `prettier --write` (ESLint first so
      Prettier formats last and has the final say).
    - `*.{json,md,css}` → `prettier --write`.
- The hook then runs `pnpm typecheck` (`tsc --noEmit`) **project-wide**, not
  per-file: `tsc` on a subset of files loses tsconfig/project context and
  produces false results. Fast enough at current repo size.

Prettier is installed in this slice (it was named as the formatter of record in
`coding-conventions.md` but not yet present). Config: `.prettierrc.json` with
Prettier defaults + 4-space indent, plus a `.prettierignore` for build
artifacts and the lockfile.

## Consequences

**Positive:**

- **Standard and legible.** Any JS dev (or agent) recognizes Husky + lint-staged
  instantly. Matches the "prefer standard over clever" bar.
- **Staged-only scope.** Formatting/linting touches only what you're committing —
  no format-the-world churn on unrelated files.
- **Layered with CI.** The hook catches issues pre-commit; CI (0.3) re-checks on
  every PR as the authoritative gate. The hook is convenience, not the wall.

**Negative:**

- **Two tools instead of one.** lefthook would fold staged-file globbing into a
  single binary. Accepted: ubiquity beats minimalism at 1-user scale, and
  lint-staged is itself a standard.
- **`prepare` runs `husky` on every install** (including CI and Vercel builds).
  Harmless — husky just (re)creates the hooks path; it no-ops where there's
  nothing to do.
- **Project-wide typecheck on every commit** is slightly heavier than per-file,
  but correct. Revisit (e.g. `tsc --incremental` or skip-on-large-diff) only if
  it becomes slow.
- **Reflow-on-touch for pre-existing files.** The 4 source files scaffolded
  before this slice (`lib/db.ts`, `lib/utils.ts`, `app/layout.tsx`,
  `app/page.tsx`) are 2-space; the staged-only hook leaves them untouched until
  edited, at which point `prettier --write` reflows the whole file 2→4-space,
  bundling a formatting diff into the next functional change. Accepted as the
  trade-off of staged-only scope (no format-the-world). Optional follow-up: a
  one-shot `prettier --write .` chore to convert all four in one isolated commit.

## Notes

- **Opt-out**: `git commit --no-verify` skips the hook — reserved for rare human
  cases. **Agents must never use `--no-verify`** (CLAUDE.md rule #12); fix the
  failing hook instead.
- `eslint-config-prettier` was intentionally **not** added: `eslint-config-next`
  defers formatting to Prettier (no stylistic-rule conflict), and Prettier runs
  last in the lint-staged chain. Add it only if a real conflict surfaces.

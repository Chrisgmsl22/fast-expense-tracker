# PR Strategy

How work is sliced into PRs in this repo. Lifted from MoneyFlow (where it's
been battle-tested) and tuned for an agent-led workflow.

## Goal

Ship one PR every 1–2 days. Phases are structured as **vertical slices** —
small, independently shippable PRs marked with `[PR]` in the roadmap.

A vertical slice is a self-contained piece of work that can be reviewed,
tested, and merged on its own. "Service + types + unit tests" is one slice;
"Page + server actions + Playwright smoke" is another.

## Rules of thumb

- Each slice should be reviewable in under 30 minutes.
- Each slice ends with passing tests and a green CI.
- Don't bundle unrelated work into a single PR.
- It's better to have 3 small PRs than 1 big one.
- When in doubt, split smaller.

## Why this matters even more in an agent-led workflow

When agents implement, the human-review bottleneck moves to *reviewing* PRs.
If PRs are large, review becomes rubber-stamp; if PRs are small, review stays
real. Slice discipline is the single highest-leverage practice in
agent-led development.

## Default slicing pattern (vertical, agent-led)

This repo uses **vertical end-to-end slices** — each PR ships a complete
user-facing flow, not a horizontal layer.

**Example for an "Expense CRUD" phase:**

1. **Create expense** `[PR]` — page + form + server action + Zod schema + service + Prisma update + unit tests + Playwright smoke
2. **List expenses** `[PR]` — page + service + table component + tests
3. **Edit expense** `[PR]` — edit page + form + server action + service + tests
4. **Delete expense** `[PR]` — server action + confirm dialog + tests
5. **Shared-expense math polish** `[PR]` — formula display, edge cases, tests

Each slice is independently mergeable and end-to-end testable. A reviewer
can `pnpm dev`, click through the flow, and verify the feature works.

### Why vertical, not horizontal

In MoneyFlow (user-written code), horizontal slices — service → controller →
routes — work because the user spends multiple sessions per layer. In this
repo (agent-written code), the agent produces all layers of a feature in
one turn. Splitting horizontally:

- Forces context re-fetches between agent runs
- Makes review harder (reviewer needs all 3 layers to verify the feature works)
- Doesn't shrink the total work — just spreads it across more PRs

Vertical slices keep PRs reviewable (still <30 min) while letting the
agent's context stay coherent.

### When to slice differently

Some work doesn't fit a vertical-flow shape. Use a separate PR for:

- **Schema migrations** — DB changes are reversible-but-painful; isolate them.
- **New dependencies** — let the reviewer scrutinize the addition on its own.
- **Refactors** — never bundle with feature work.
- **Cross-cutting changes** (new error class used everywhere, lint rule additions, etc.).

## Commit guidelines

**Format:** Conventional Commits — `type(scope): subject`.

- **Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`.
- **Scope** (optional): the slice (`0.3`) or area (`claude`, `db`). Use when it adds signal.
- **Subject:** imperative mood ("add", not "added"), ≤72 chars, no trailing period. It **must stand alone** — readable in `git log --oneline` without opening the diff.

**Body — omit by default.** Add one only when the WHY isn't obvious from the subject + diff. Then keep it to 1–3 short lines of rationale / tradeoff / risk, wrapped ~72 cols. **Never restate the diff** — the diff already shows what changed; the body exists for what the diff can't show.

- One logical change per commit.

```
# Good — WHY isn't obvious, so one line earns its place:
fix(db): guard migrate deploy to VERCEL_ENV=production

Preview builds share the prod branch; running migrate there would
mutate production data.

# Good — trivial change, subject stands alone, no body:
docs: add scripts table to README

# Bad — 8 lines re-narrating a 3-line doc change the diff already shows:
docs: require git fetch at session start
<paragraphs restating each edited file>
```

Context that belongs to the whole change (not a single commit) goes in the **PR description**, not stacked into every commit body.

## When to commit

- After completing a slice locally with green tests/lint.
- Only commit when explicitly asked by the user — never auto-commit.

## Branching

- `main` — production-ready code, branch-protected (set up in Phase 0).
- `feat/<phase>.<slice>-<short-name>` — feature branches (e.g., `feat/3.1-expense-create-form`).
- `docs/<topic>` — documentation-only branches.
- `fix/<issue>` — bug fix branches.

## Pull request format

**All PRs use the same sections** — slice and non-slice (`docs/`, `chore/`,
`fix/`) alike. Consistency keeps review predictable. Keep each section tight:
1–3 bullets, not paragraphs. The Summary is the human- and future-agent-facing
"why this exists"; the rest scopes and verifies it.

- **Slice PRs** populate the sections from the phase file's Plan block (see
  [slice-planning.md](./slice-planning.md)).
- **Non-slice PRs** fill them from the change itself. Sections that genuinely
  don't apply (e.g. Scope (out) on a one-line fix) get a short "n/a" rather
  than being dropped.

```markdown
## Summary
1–3 bullets: what shipped and why.

## Scope (in)
What this PR touches.

## Scope (out)
Explicitly deferred / not in this PR.

## Test plan
Checklist of how to verify locally.

## Notes
Anything reviewer should know (gotchas, follow-ups, etc.)
```

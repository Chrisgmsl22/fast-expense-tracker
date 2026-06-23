# Claude AI Assistant Guide for fast-expense-tracker

This file is **stable instructions** — how to work in this repo, what's
being built, and the operating model. Anything that changes frequently (current
phase, progress, in-flight work) lives in `docs/roadmap/`, not here.

## Session startup — REQUIRED

At the start of every session:

1. **Sync git with the remote — before reading anything or reasoning about branches.** Run `git fetch origin`, then confirm local `main` matches `origin/main` (`git log --oneline -1 origin/main`). The startup `gitStatus` snapshot and your local refs are **point-in-time** — they go stale the moment anything merges, and a merge may have landed between sessions. Never decide branch topology (rule #13's "branch off up-to-date `main`") or conclude a dependency is "unmerged / missing from main" from un-fetched refs. If local state implies a blocker, **fetch to confirm it's real before escalating**. See [`docs/lessons.md`](./docs/lessons.md) (2026-06-01).

### Branch-sync policy (automated)

The `SessionStart` hook [`.claude/hooks/branch-status.sh`](./.claude/hooks/branch-status.sh) runs the fetch from step 1 automatically and injects a `[branch-status]` line into your context every session. Act on its verdict **before** orienting:

- **"PR merged" + tree clean** → no need to ask: `git checkout main`, `git pull --ff-only`, then `git branch -d <branch>` (delete the **local** merged branch only — never touch the remote). Then proceed.
- **"PR merged" + tree dirty** → **STOP.** Report the uncommitted changes and let the user decide; do not switch.
- **"work-in-progress"** → the git ancestor check is **blind to squash/rebase merges** (they rewrite commit SHAs). Before trusting "unmerged", confirm the PR state for the branch via the **GitHub MCP** (`mcp__github__list_pull_requests` / `pull_request_read` by head branch). If it's actually MERGED → treat as the merged case above. If genuinely OPEN/none → tell the user what remains on this slice.
- **On `main`, behind** → `git pull --ff-only`.

This repo merges PRs via **merge commit** (not squash/rebase), which keeps the ancestor check reliable; the MCP fallback is defense-in-depth in case that ever changes.

### Roadmap-status policy (automated)

The `SessionStart` hook [`.claude/hooks/slice-status.sh`](./.claude/hooks/slice-status.sh) injects a `[roadmap]` line reporting **your slice**, **available slices**, and **in-flight slices** (derived from [`docs/roadmap/slices.json`](./docs/roadmap/slices.json) + git — see [ADR-0008](./docs/decisions/0008-derived-roadmap-status.md)). Use it to choose work:

- **Pick only from _available_** slices (deps satisfied). Never start a _blocked_ one.
- **Never claim an _in-flight_ slice** — another agent/worktree owns it.
- Shipped state is git-inferred via merge-commit grep, which is **blind to squash/rebase merges**. If a slice looks unshipped but a PR may have landed, **MCP-confirm** before acting (`mcp__github__list_pull_requests` / `pull_request_read` by head branch).
- Run `pnpm roadmap:status` any time mid-session to refresh (parallel state changes after SessionStart).

Then read these to get oriented:

2. **[docs/roadmap/README.md](./docs/roadmap/README.md)** — Single "where are we?" index. The currently active phase/slice is at the top.
3. **The active phase file** under [docs/roadmap/](./docs/roadmap/) — Slice list for the current work.
4. **[docs/decisions/](./docs/decisions/)** — Recent ADRs (skim).

Skim only — the roadmap README points you to what matters right now.

---

## Project Overview

**fast-expense-tracker** is a temporary personal expense tracker built while
the user's long-form learning project (MoneyFlow / my-expense-tracker) is
under construction.

This repo is **agent-led**: agents write the code, the user reviews. The
_opposite_ of MoneyFlow's "user writes, AI mentors" model. Code-quality bar
is the same; speed is prioritized over deliberate practice.

**User context** (stable facts about Christian):

- Located in Mexico City, uses MXN currency
- Shares expenses with girlfriend at a 68/32 split (income-ratio based)
- Follows 50/25/25 budgeting rule
- Updates expenses weekly (Monday mornings) + ad hoc from mobile
- Repo is **public** for portfolio visibility — code quality and docs matter
- Personal financial data lives in Neon Postgres, never in the repo

---

## Operating Model — CRITICAL

### Mode 2 default: Agents implement, user reviews

Unlike MoneyFlow's learning-first approach, this repo is **agent-led**:

- **Agents write the code** — implementer subagent picks up a slice and ships it
- **User reviews** — every PR gets a real review (often via the reviewer subagent first)
- **Same quality bar as MoneyFlow** — strict TypeScript, tests, conventions, ADRs for non-obvious decisions
- **Speed is a goal** — but never at the cost of conventions or security

### Named subagents

Two persistent subagents live in `.claude/agents/`:

- **`implementer`** — picks up the active slice, implements end-to-end with tests, prepares PR
- **`reviewer`** — adversarial review of a slice before merge

See [docs/conventions/agent-workflow.md](./docs/conventions/agent-workflow.md) for when to invoke which.

### Slice lifecycle (same as MoneyFlow)

Before opening a PR for a slice:

1. Mark all tasks `[x]` in the phase file
2. Copy the Plan block content into the PR description
3. **Delete the Plan block** from the phase file

All three steps happen in the same PR — never after merging. See
[docs/conventions/slice-planning.md](./docs/conventions/slice-planning.md).

---

## AI Assistant Rules

### ✅ AI SHOULD:

1. **Implement by default** — Mode 2 means write the code, don't ask "want me to write this?" for routine work.
2. **Always re-read modified files before reviewing** — Never rely on cached file contents.
3. **Follow conventions strictly** — `docs/conventions/coding-conventions.md` is the source of truth.
4. **Write tests with every slice** — no untested code lands.
5. **Write ADRs for significant decisions** — non-obvious trade-offs, deferred features, architectural choices.
6. **Update `docs/roadmap/README.md`** when slice or phase status changes.
7. **Flag security concerns immediately** — anything touching env, secrets, auth gets extra care.
8. **Read files with the Read tool, not the shell** — to inspect file contents always use Read (and Grep/Glob for search). Do NOT use `cat`/`head`/`tail`/`sed`/`echo` in Bash to read or display files. **This includes running code to parse, filter, or extract from a repo file** — no `node -e`/`jq`/`python -c`/`grep`-into-a-script to pull fields out of JSON/YAML/config. Read the file and parse it yourself; the file being large or you only wanting "a few fields" is not an exception (use Read's `offset`/`limit` or Grep for big files). Reserve Bash for things only the shell can do: `git` (no dedicated tool exists for it), running tests/build/lint, and inspecting paths outside the repo (e.g. `~/.claude`). Don't add `echo "=== ... ==="` banners to group command output.

### ❌ AI SHOULD NOT:

1. **Never commit `.env*` files** — `.gitignore` excludes them; if `git status` shows one, STOP and investigate.
2. **Never hardcode secrets** — DB URLs, auth secrets, API keys live in env vars only.
3. **Never log secret values** — even in debug output. Mask or omit.
4. **Never read `.env*` files** (except `.env.example`) — runtime tools load them; you never need the value. Harness denies these reads via `.claude/settings.json`. Don't bypass via `cat`/`head`/`tail`/etc.
5. **Never echo env/secret values in any output** — not in tool descriptions, commits, PR descriptions, error messages, or final reports. Mask as `<redacted>` if a reference is unavoidable.
6. **Never edit harness files silently** — `.claude/agents/**`, `.claude/settings.json`, `CLAUDE.md`, `.gitignore`, `docs/decisions/**`, `docs/conventions/**` shape the rules themselves. Escalate to the user first; sign-off in the same conversation.
7. **Never fetch external URLs** — no `curl`/`wget` to URLs not already referenced in committed code. No installs from non-registry sources (no GitHub URL installs, no tarball URLs).
8. **Never expand slice scope** — if the Plan block says scope (in) is X, don't bundle Y. Open a separate slice.
9. **Never skip the slice lifecycle** — tasks/Plan/PR-description handoff is non-negotiable.
10. **Never commit without explicit user request** — same rule as MoneyFlow.
11. **Never use `gh` CLI** — `gh` is configured for work's GHE. For PRs on this personal repo (`Chrisgmsl22`), use the **GitHub MCP** (personal, repo-scoped PAT — `mcp__github__*` tools: create/read/update PRs, comment, read checks) or plain `git` + browser URLs. Never `gh` (harness denies `gh *`).
12. **Never `git commit --no-verify`** — fix the failing hook instead. Harness denies this too.
13. **Never commit or push directly to `main`** — always branch off up-to-date `main` (`git pull` first), commit on a `feat/`/`chore/`/`docs/` branch, and land via PR. No exceptions, including docs/harness changes. (GitHub branch protection will enforce this once CI lands — see `docs/operations/setup.md §4`.)

---

## Security and secrets

The repo is **public**. Treat everything that lands in the repo as world-readable.

### Hard rules

1. **`.env*` is gitignored.** Never override. If you need a new env var, add it to `.env.example` (with placeholder) and document in `docs/conventions/coding-conventions.md`.
2. **No secrets in code, ever.** Read from `process.env.XXX` at runtime. If you find a hardcoded secret, stop and flag it.
3. **No secrets in logs.** Even masked values like `[REDACTED]` are fine; raw values are not.
4. **No secrets in test fixtures.** Use `'test-secret'` or generated values per test.
5. **Database URLs leak through migrations.** Prisma migrations don't include URLs, but verify before pushing.
6. **Auth flows get extra review.** Anything touching `auth.config`, session, cookies, or JWT gets reviewer-subagent review before merge.

### What to do if you find a leaked secret

1. **Don't push.** If it's only local, rewrite history before pushing.
2. **If already pushed:** rotate the secret immediately at its source (Neon, Vercel, etc.), THEN scrub history (`git filter-repo` or BFG), THEN force-push with user's explicit approval.
3. Write an ADR explaining what happened and how the process changed to prevent recurrence.

---

## Code Review Standards

Same as MoneyFlow. The full conventions live in
[docs/conventions/coding-conventions.md](./docs/conventions/coding-conventions.md).

At a high level, review checks:

- **Security** — input validation, no SQL injection (Prisma handles), OWASP top 10, secret hygiene.
- **Convention adherence** — naming, file organization, error handling, validation patterns.
- **Test coverage** — happy path + error paths + edge cases.
- **Silent failures** — swallowed errors, missing error handling, generic `throw new Error()`.
- **Scope discipline** — did the PR stay inside Scope (in)?

---

## Domain-Specific Notes

### Shared expenses

User pays full amount but only a percentage is their actual expense.

- Always use `actualExpenditure` for totals, never `amount`
- Formula: `actualExpenditure = isShared ? amount × yourPercentage : amount`
- Default `yourPercentage`: 0.68 (currently — env var, may change with income ratio)
- Field is **stored** (not computed at query time) so historical splits remain correct when the default changes
- Full math reference, edge cases, and test scenarios: [docs/reference/domain-reference.md §5](./docs/reference/domain-reference.md)

### Categories

Categories are seeded from the frozen reference at
[docs/reference/domain-reference.md](./docs/reference/domain-reference.md)
(originally lifted from MoneyFlow's `seed.ts`). All 13 system categories with
their subcategories, `isRelevant` flags, and slugs live there.

`isRelevant` flag distinguishes essentials (50%) from discretionary (25%) in
the 50/25/25 tracker. **Savings** is treated as its own bucket on the
dashboard, NOT as essentials — see the "Important nuance for 50/25/25 logic"
section in `domain-reference.md`.

### Card color coding

Same as MoneyFlow:

- Amex Platinum: Gray
- Amex Gold: Yellow/Gold
- NU: Purple
- BBVA: Blue
- Cash: Green

### Budget philosophy (50/25/25 rule)

- 50% of income → essentials (relevant categories minus savings)
- 25% of income → discretionary (non-relevant categories minus unassigned)
- 25% of income → savings (the `savings` category)

---

## How to Work in This Repo

1. **Starting work**: read the roadmap; identify the active slice; read its Plan block.
2. **Implementing**: invoke the `implementer` subagent OR implement directly in main thread. Follow conventions.
3. **Reviewing — MANDATORY loop, not optional**: when implementation is complete, run an adversarial review (`reviewer` subagent, or the `/review-changes` skill) using its full criteria — including the silent-failure / hidden-state / state-UI-sync / user-flow / message-accuracy lenses, **and a real-browser check for any FE slice** (dev server + Playwright MCP). Fix **every Critical and Warning**, then **re-review**. Repeat until a pass returns no Critical/Warning. **Do not open the PR until the review is clean.** Skipping this is how the 1.4 silent-save-failure shipped into an open PR (see `docs/lessons.md`).
4. **Pre-PR**: mark tasks [x], copy Plan → PR description, delete Plan block — all in one commit.
5. **Open PR**: plain `git` + paste the URL into browser. No `gh` CLI in this repo.
6. **After merge**: update `docs/roadmap/README.md` if phase/slice status changed.

The goal is to ship slices fast while keeping the codebase reviewable, tested, and secret-free.

# fast-expense-tracker

Personal expense tracker — MXN, shared-split aware. **Agent-led**: agents write
the code, Christian reviews. Same quality bar as a production repo; speed is a
goal, conventions are not negotiable.

The repo is **public**. Everything that lands here is world-readable. Real
financial data lives in Neon Postgres and stays there — never in the repo, and
never in a fixture or seed. Test data is invented.

## Orient

Up to five `SessionStart` lines arrive when the client runs `.claude/hooks/*.sh`:
`[branch-status]`, `[roadmap]`, `[chores]`, `[bugs]`, `[worktrees]`. No hook
runner? Run `bash scripts/session-context.sh` first — same lines, plain text.
Each carries a verdict and the action it implies; **act on them before reading
anything else.** They are derived live from git + the JSON registers
([ADR-0008](./docs/decisions/0008-derived-roadmap-status.md)) and outrank your
memory. Refresh with `pnpm roadmap:status` / `bugs:status` / `chores:status`.

Two verdicts need judgement:

- **"work-in-progress"** — the ancestor check is blind to squash/rebase merges.
  Confirm the PR state by its head branch through [GitHub access](#github-access).
  Do this before you report an unmerged slice or a missing dependency.
- **"PR merged" + dirty tree** — report the uncommitted changes; Christian
  decides. Clean tree: switch to `main`, pull, delete the local branch.

Then read [`docs/roadmap/README.md`](./docs/roadmap/README.md) — the "where are
we" index — and the active phase file it points at.

## How work flows

One **slice** (or chore, or bug) per branch, per PR. The loop:

1. Pick from _available_ work only. Never claim something marked in-flight —
   another worktree owns it.
2. Branch off up-to-date `main`: `feat/`, `chore/`, or `docs/`.
3. Implement with tests. Delegate to the `implementer` subagent by default.
4. **Review loop** — run the `reviewer` subagent or `/review-changes`, fix every
   Critical and Warning, then re-review. Repeat until a pass comes back clean.
   FE slices include a real-browser check. Open the PR only after a clean pass.
5. Slice lifecycle before the PR: tick the tasks, copy the Plan block into the PR
   description, delete the Plan block — one commit, same PR.

Details: [`agent-workflow.md`](./docs/conventions/agent-workflow.md) ·
[`slice-planning.md`](./docs/conventions/slice-planning.md) ·
[`session-handoff.md`](./docs/conventions/session-handoff.md)

**Verify a subagent's work before building on it.** A "done" report with an empty
`git diff` means it wrote nothing. Check the diff, then trust it.

**Parallel work needs real isolation.** Two agents in one checkout share a HEAD
and an index — one `git checkout` switches the branch out from under the other.
Second concurrent slice → `git worktree add ../fast-expense-tracker-<short> -b <branch> origin/main`
for each. Target a worktree with `git -C` / `pnpm -C`; install once after adding.

Retire a worktree once its PR merges: `git worktree remove <path>`, then
`git branch -d <branch>`. **A worktree holding uncommitted changes gets reported,
never removed** (`docs/lessons.md` 2026-08-05). The `[worktrees]` line flags
merged ones each session. Confirm the merge through [GitHub access](#github-access) before you remove a worktree.

## Rules

**Write the code.** Routine work needs no permission — pick up the item and ship
it. Christian reviews; that is the operating model. Save the questions for the
list below and for genuine ambiguity.

**Never merge or approve a pull request, and never push to `main`.** Opening the
PR is yours; merging is Christian's, always. This is not a sign-off you can ask
for in the moment — "ship it", "let's do it", or "can we do it now" means finish
the PR and hand over the link. Green checks answer whether it is safe, never
whether it is your call. A merge here deploys to production and can run a
migration against real financial data. When work is blocked behind a merge, name
the PR he needs to merge instead of clearing the block yourself.

Ask for sign-off in-conversation before you:

- **Commit or push anything.** Christian asks for commits explicitly.
- **Edit the rules themselves** — `AGENTS.md`, `.claude/agents/**`,
  `.claude/hooks/**`, `.claude/settings.json`, `.gitignore`,
  `docs/decisions/**`, `docs/conventions/**`.
- **Expand a slice past its Scope (in).** Found something worth doing? Report it
  as a follow-up and open a separate slice.

Always:

- **Land through a PR off `main`.** Every change, docs included.
- **Use [GitHub access](#github-access)** for PRs, reviews, and merge checks.
  GitHub MCP is optional. The local `.mcp.json` token supports direct GitHub REST API access.
- **Read secrets from `process.env`**, reference them by name only, and use
  `.env.example` when you need to know what exists. Mask any value that has to
  appear in output as `<redacted>`.
- **Never open any `.env*` file except `.env.example`** — not with Read, not
  with `cat`/`head`/`grep`. Runtime tools load them; you never need a value.
- **Inspect files with Read/Grep/Glob.** Reserve Bash for git, tests, builds, and
  paths outside the repo.
- **Fix the failing hook** rather than reaching for `--no-verify`.
- **Install from the default registry** through pnpm — no GitHub URLs, no tarballs.
- **Reach the network only through URLs already referenced in committed code.**
  `curl`/`wget` to anywhere else needs sign-off first. You hold Bash in a public
  repo; treat egress as the boundary it is.

Found a secret already committed? Stop, rotate it at the source, tell Christian
before touching history, and write an ADR covering what changed in the process
so it cannot recur.

## PR and task titles

- Use `fet-<type>-<short-name>` for every PR title. `fet` means Fast Expense Tracker.
- Choose `chore`, `bug`, `feat`, `docs`, or another appropriate task type.
- Use lowercase words and hyphens, for example, `fet-chore-summary-layout` or `fet-bug-settlement-balance`.
- Set the Codex task or session title to the planned PR title when the scope is known.
- Keep the task or session title identical to the final PR title. Update it whenever the PR title changes.

## GitHub access

GitHub MCP is not required. Use the token in the repository root `.mcp.json` for direct GitHub REST API access.

- Read `.mcp.json` in memory. This read is an explicit exception to the `process.env` rule for secrets.
- Use `mcpServers.github.headers.Authorization` as the HTTP `Authorization` header for `https://api.github.com`.
- Confirm access with `GET https://api.github.com/repos/Chrisgmsl22/fast-expense-tracker/pulls/81` or another read-only endpoint for this repository.
- Try this direct access before you report that GitHub access is unavailable because MCP is absent.
- Never print the token or the raw configuration. Never copy the token into command arguments, files, logs, or commits.
- Do not edit `.mcp.json` to access GitHub. Keep the token in memory for the request.
- Plain `gh` uses the work GHE host. Never use its default credentials for this repository.
- If you use `gh`, explicitly target `github.com`. Pass the token through `GH_TOKEN` only in that subprocess's environment.
- Remove the authorization scheme from the header value in memory before you assign its token to `GH_TOKEN`.
- All commit, push, approval, and merge restrictions above still apply.

## Browser window size

The agent may resize its own current test window when responsive checks require a smaller screen size.
This exception supersedes the blanket resize prohibition only for that window.

- Do not resize another user's or agent's window. Do not change the shared browser configuration.
- Prefer native window bounds. Retain `viewport: null` so the page follows the window without persistent device-metrics overrides.
- Do not call `browser_resize`. This exception does not permit viewport emulation.
- Record the original window bounds before the test. Restore those bounds after the test.

## Conventions

[`coding-conventions.md`](./docs/conventions/coding-conventions.md) is the source
of truth and points at the rest. Reach for these directly when the work is in
their area:

| Area                                  | Doc                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Layering, repository + DI, test seams | [`architecture.md`](./docs/conventions/architecture.md)                                                                   |
| React / Next patterns                 | [`frontend.md`](./docs/conventions/frontend.md)                                                                           |
| What to test, coverage tiers          | [`testing.md`](./docs/conventions/testing.md)                                                                             |
| Vertical slices, PR shape             | [`pr-strategy.md`](./docs/conventions/pr-strategy.md)                                                                     |
| Foundation → fan-out → integration    | [`parallel-slicing.md`](./docs/conventions/parallel-slicing.md)                                                           |
| What the app does, and its trajectory | [`specs/0001-initial-design.md`](./docs/specs/0001-initial-design.md) — §7 maps every slice to its scope and dependencies |

Shape of the stack: business logic pure in `lib/domain`, data access behind a
repository interface injected into actions, actions orchestrate only. No `db` in
an action, component, or page.

**Read [`lessons.md`](./docs/lessons.md) before a slice in an area it covers**
(migrations, auth, env, dev-server, parallel agents, subagent dispatch). It is a
log of friction already paid for — do not re-litigate a solved problem. Append to
it when a slice surfaces new friction.

Write an ADR in [`docs/decisions/`](./docs/decisions/) for a non-obvious
trade-off, a deferral, or an architectural call. Superseding an existing ADR
needs sign-off first.

## Domain

Christian is in Mexico City, tracks in **MXN**, splits shared expenses with his
partner, and follows a 50/25/25 budget.

The one formula to carry everywhere:

```
actualExpenditure = isShared ? amount × yourPercentage : amount
```

**Totals use `actualExpenditure`, never `amount`.** It is stored, not computed at
read time, so historical splits survive a change to the default percentage. The
exception is a card's balance: a card was charged the full `amount` regardless of
who owes what.

Buckets: 50% essentials (relevant categories, minus savings) · 25% discretionary
(non-relevant, minus unassigned) · 25% savings. **Savings is its own bucket, not
an essential** — the trap in every 50/25/25 calculation here.

Categories, subcategories, `isRelevant` flags, card colors, and the full split
math: [`domain-reference.md`](./docs/reference/domain-reference.md).

Before you propose a change to how money is counted, run `pnpm data:snapshot`
and do the arithmetic on his real rows. It is read-only and refuses any database
that is not local. Reasoning from the schema alone is how a bucket ends up 60%
short of what the month actually held.

## Harness

Rules are enforced where they can be, and written down only where they cannot:

| Layer                           | Lives in                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Session context, guards         | `.claude/hooks/` (wired in `.claude/settings.json`)                                                               |
| Session context, no hook runner | `scripts/session-context.sh` — runs the same hooks, prints their lines as plain text                              |
| Subagent hand-back              | `.claude/hooks/subagent-diff.sh` — `PostToolUse(Agent)`; one `[subagent-diff]` line: changed paths + diff summary |
| Hard boundaries                 | `permissions.deny` in `.claude/settings.json`                                                                     |
| Subagents                       | `.claude/agents/` — frontmatter validated by `scripts/check-agent-frontmatter.sh` (pre-commit + CI)               |
| Hook behaviour                  | `scripts/test-hooks.sh` — verdict tests against a throwaway repo (CI)                                             |
| Pre-commit                      | `.husky/`                                                                                                         |
| Must-not-merge                  | `.github/workflows/ci.yml`                                                                                        |

This file is the instructions. A tool that needs its own filename gets a symlink
pointing here, never a copy. Hook scripts keep their logic in plain bash, so any
tool can call them directly.

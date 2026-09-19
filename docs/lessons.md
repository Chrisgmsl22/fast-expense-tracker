# Lessons Learned

A running log of topics where an agent (or the team) hit avoidable friction —
the root cause and the fix — so we don't relitigate the same problem. Append
newest at the top. Keep entries short.

Entries before 2026-06-23 live in [`lessons/2026-h1.md`](./lessons/2026-h1.md) — same format, nothing retired.

## When to log a lesson

Log an entry when **either** of these is true:

- **Time threshold**: the friction consumed ≥3 wasted turns OR ≥30 minutes of surprise effort relative to expected scope.
- **Reviewer-surfaced**: the `reviewer` subagent flagged a lesson candidate (see its report format) — even if the work itself shipped fine.

Bias toward logging. A short entry costs little; an unlogged lesson costs the next slice. If unsure, log it.

## Template

```
### <date> — <topic>
- **Symptom:** what went wrong / why it dragged
- **Root cause:** the actual underlying reason
- **Fix / decision:** what resolved it
- **Lesson for next time:** the generalizable takeaway
```

---

### 2026-09-18 — A spend card reused a broader financial total

- **Symptom:** The "Spent from savings" card counted Savings-category allocations as "Your purchases".
- **Root cause:** The helper reused `notFromIncome`, which includes those allocations. Its scope exceeds the card's purchase scope.
- **Fix / decision:** Exclude non-payment Savings-category allocations only in the new helper. Preserve actual partner payments and duplicate-ID checks.
- **Lesson for next time:** Test category and funding-source combinations before reuse of a financial aggregate. Check that its rows match the new label.

---

### 2026-09-16 — A new meaning borrowed a colour token, and two arcs became one

- **Symptom:** CHORE-14's breakdown modal drew "not from this month's income" in
  `--bucket-discretionary` (#d97706) beside "money to the partner" in
  `--transfer` (#ca8a04). Nine degrees of hue apart, as the only two arcs of one
  donut: indistinguishable, and hopeless under any colour-vision deficiency. The
  reviewer caught it two rounds after an earlier hue clash in a different chart.
- **Root cause:** a new semantic meaning was given the nearest existing token
  rather than its own, and the fix for the first clash was checked only in the
  chart where it was reported. `globals.css` had already separated gold from
  orange deliberately; the borrowed amber landed between them.
- **Fix / decision:** re-toned the slices by what FUNDED them, so no two arcs in
  any donut sit under 100° apart.
- **Lessons for next time:**
    1. A new semantic meaning gets its **own** colour token, not the nearest
       existing one. A token carries a meaning; reusing it merges two.
    2. Check **every** chart's slice set pairwise for hue distance, not only the
       chart where a collision was reported. Adjacent arcs have no labels between
       them, so the hue is the whole distinction.

---

### 2026-08-05 — A brand-new worktree reported itself as "likely merged"

- **Symptom:** `[worktrees]` flagged a freshly created `chore/harness-rebuild`
  worktree as "— likely merged" and emitted the cleanup ACTION telling the agent
  to `git worktree remove` it. The worktree held uncommitted work.
- **Root cause:** `worktree-status.sh` decided "merged" from
  `merge-base --is-ancestor <branch> origin/main` alone. A branch created off
  `origin/main` with no commits yet sits exactly AT it, so the ancestor test
  passes trivially. The zero-commit trap was already known — the primary
  checkout is explicitly exempted for it — but the exemption was never applied
  to linked worktrees.
- **First fix, and why it was worse:** requiring `rev-list --count origin/main..<branch> > 0`
  before the merged check. That is **the same predicate inverted** — the count is
  0 exactly when `--is-ancestor` succeeds — so the pair can never both hold and
  merged-detection became unreachable. The noisy false positive was traded for a
  silent false negative: stale worktrees would accumulate forever, unreported.
  The `reviewer` subagent caught it before merge.
- **Fix / decision:** keep the ancestor test and add a **tip comparison**. A
  merged branch's tip trails `origin/main`; a fresh branch's tip _is_
  `origin/main`. Verified against both cases — a real merged branch and a
  zero-commit one. **Residual false positive:** a fresh worktree whose base
  already trails `origin/main` (created before `main` moved) has a trailing tip
  too and still reads "likely merged". The MCP-confirm step in the ACTION text
  plus the never-remove-a-worktree-with-uncommitted-changes guard are the safety
  net for that case. `scripts/test-hooks.sh` pins the four verdicts.
- **Lesson for next time:** two ways to compute "is this branch behind main" are
  usually one way wearing a hat. Before combining git predicates, check whether
  they are independent — `--is-ancestor` and `rev-list --count` are not. And test
  a guard against the case it is supposed to **fire** on, not only the case it is
  supposed to suppress; testing only the false positive is what let the dead
  condition through.

### 2026-07-28 — Codex's first-run import copied a repo secret into a non-ignored file

- **Symptom:** Unexplained `.codex/` directory and `AGENTS.md` appeared in the
  repo, containing a live GitHub PAT in `.codex/config.toml` and doc paths
  rewritten to a non-existent `.Codex/`.
- **Root cause:** Codex CLI ran a one-time Claude Code import on first launch
  (`~/.codex/claude-cowork-import-history.json`). It read `.mcp.json` — which is
  gitignored and legitimately holds the PAT — and wrote the token into
  `.codex/config.toml`, which no rule ignored. `AGENTS.md` was generated by a
  case-insensitive `claude`→`Codex` replace over `CLAUDE.md`, breaking every path.
- **Fix / decision:** deleted `.codex/` and the generated `AGENTS.md`; the
  provider-agnostic harness is being built deliberately instead.
- **Lesson for next time:** secret hygiene based on **paths** does not survive a
  tool that invents new paths. `.gitignore` protected `.mcp.json` specifically;
  the import wrote somewhere else. Value-scanning is the guard that generalizes,
  and it already runs: gitleaks scans the full history in CI
  (`.github/workflows/ci.yml`, `secret-guards` job). Audit what a new agent tool
  writes into a repo the first time you launch it.

### 2026-07-13 — The `implementer` "writes nothing" was a malformed `tools:` grant + agent-def caching

- **Symptom:** Every `implementer` subagent run did nothing — `tool_uses: 0`, tool
  calls emitted as _text_, results hallucinated, `git status` clean. The read-only
  `reviewer` worked fine in the same session. (First seen 2026-06-26; recurred.)
- **Root cause (two compounding):**
    1. `.claude/agents/implementer.md` had `tools: All tools` in frontmatter. That
       field is a **comma-separated list of real tool names**, so `All tools` parsed
       as tools literally named `All` and `tools` (the registry showed
       `Tools: All, tools`) → the agent was granted **zero real tools**. With no
       Edit/Write/Bash it degraded to narrating tool calls as prose. The working
       `reviewer` has a valid list (`Read, Grep, Glob, Bash`) — that contrast is the tell.
    2. **Agent definitions are cached at session start and do NOT hot-reload.**
       Editing `implementer.md` mid-session had no effect — every run used the
       session-start (broken) version, so the fix "didn't work" and sent me chasing
       a phantom second cause. Proven two ways in-session: a newly-added agent file
       was "not found", and a distinctive token injected into the reviewer's prompt
       never appeared in its output.
- **Fix:** removed the `tools:` line entirely (omitting it grants ALL tools — the
  intent). Documented the invariant in the agent file. **Verification requires a new
  session** (cache) — after restart, dispatch the implementer on a small real task
  and confirm `git diff` shows the expected files. Fallback if omit still misbehaves:
  an explicit list mirroring the reviewer (`Read, Edit, Write, Bash, Glob, Grep`, plus
  Playwright MCP for UI smoke tests).
- **Lessons for next time:**
    1. Validate an agent's `tools:` frontmatter against the **real tool-name list** —
       a plausible prose value (`All tools`) silently disables the agent. Omit the
       field for all-tools; never write a phrase.
    2. **You cannot test an agent-config change in the session you make it** — defs
       are cached at start. Edit → restart → verify. Budgeting for a restart is part
       of any agent-config fix.
    3. A working read-only sibling agent (`reviewer`) is the fastest control for
       isolating a _grant_ problem from a _prompt_ problem.

#### Follow-up (next session) — grant fix confirmed, but a SECOND, intermittent cause: fenced `bash` exemplars

- **Grant fix works.** In a fresh session the `implementer` used tools for real — a
  2-call probe and a full 47-file slice at **221 `tool_uses`**. The malformed-grant
  cause is closed.
- **Residual reproduced.** The _same_ agent, same session, then no-opped (`tool_uses: 0`,
  fake ` ```bash ` blocks emitted as text, a hallucinated "the file tools are broken"
  story) on **2 of 4** runs — both were "apply the review fixes" tasks. Intermittent, not
  deterministic.
- **Root cause of the residual:** the prompt **modelled tool use as literal ` ```bash `
  fenced blocks** (Step 0 had two; Process/Report had more). Fenced runnable blocks
  probabilistically train the model to _reproduce them as text_ instead of _invoking_ the
  tool. The failing runs literally echoed the Step-0 ` ```bash ` block back.
- **What it is NOT:** raw length. My first guess was "heavy ~140-line prompt." Wrong — the
  `reviewer` is _also_ long (~193 lines) and never degrades. The real differentiators:
  far fewer fenced-command exemplars + an **explicit narrow `tools:` grant**.
- **Controlled proof:** a `general-purpose` agent (lighter prompt, no fenced-command
  mimicry) completed the _exact_ task the `implementer` no-opped on twice — pinning the
  fault on the implementer's prompt, not the session or the tools.
- **Fix (this PR):** rewrote `implementer.md` — (a) explicit `tools: Read, Edit, Write,
Bash, Glob, Grep` mirroring the reliable `reviewer` (browser/PR work is the main
  thread's, so no MCP); (b) an upfront "**call tools, don't narrate them**" rule with an
  "if a result is empty, re-run — don't fabricate" instruction; (c) converted every
  ` ```bash ` exemplar to prose. Requires a new session to verify (defs cache).
- **Lessons:** (1) don't put runnable ` ```bash ` blocks in an agent's system prompt —
  describe commands inline/in prose so the model _calls_ rather than _prints_. (2) When an
  agent degrades intermittently, a **different agent type on the identical task** is the
  cleanest way to separate prompt-fault from session/tool-fault. (3) Until a reworked
  agent is verified in a fresh session, route work through a proven-reliable agent
  (`general-purpose`) — don't keep re-dispatching the flaky one.

---

### 2026-06-28 — Two agents shared one checkout → branch switched out from under a slice, trees intermingled

- **Symptom:** Mid-way through shipping slice 1.7, `git add -A` swept up 7 unrelated files (an architecture-DI refactor) alongside the 1.7 work, and the branch had silently changed from `feat/1.7-observability` to `refactor/architecture-di`. A blind commit would have mixed two agents' work and wrongly deleted `expense.service.ts` on the 1.7 PR.
- **Root cause:** a second agent was launched to work "in parallel" but in the **same working directory** (`git worktree list` showed one checkout). A shared checkout = a shared HEAD + index: the other agent's `git checkout` switched the branch for both sessions, and its uncommitted files landed in the same tree as the 1.7 changes.
- **Fix / decision:** Recovered by switching back to the slice branch, staging only the 18 known 1.7 files **explicitly** (never `-A`), verifying `git diff --cached --stat`, committing, then restoring the other agent's branch. Codified a **parallel-work policy** (CLAUDE.md §Session startup): survey open slices/branches/PRs before parallel work, and with ≥2 branches active, isolate each agent in its own `git worktree`.
- **Lesson for next time:** Two agents must never share one working directory — the moment a second concurrent branch exists, give each its own worktree. And before any commit in a shared/dirty tree, review the **staged set explicitly** (`git diff --cached --stat`); `git add -A` is how foreign work sneaks into a PR.

---

### 2026-06-26 — A subagent reported "done" but wrote nothing; and `cd`/echo drift

- **Symptom (lost work):** An `implementer` subagent ran ~20 min / ~76k tokens on
  slice 1.6 and returned a report, but `git status` was clean — zero changes. Its
  final message contained raw, unclosed tool-call syntax printed as prose and
  referenced a file (`ExpenseTable.test.tsx`) that never existed.
- **Root cause:** The agent degraded into **emitting tool calls as plain text**
  instead of invoking them (`tool_uses: 0`). Nothing was written anywhere — not a
  lost worktree, just no real file operations. The filename was hallucinated.
- **Symptom (drift):** Despite a standing rule, the main agent kept prefixing Bash
  with `cd <repo> && …` and `echo "=== banner ==="` — memory is advisory and it
  drifted.
- **Fix / decision:**
    1. **Verify subagent output at the boundary** — after any subagent says "done,"
       run `git status`/`git diff` and confirm the expected files changed before
       trusting or building on it. Codified in `CLAUDE.md` (Named subagents).
    2. **Enforce mechanical rules with hooks, not memory** — added a
       `PreToolUse(Bash)` hook (`.claude/hooks/bash-guard.sh`) that warns on a
       leading `cd` and `echo "=== … ==="` banners.
- **Lessons for next time:**
    1. A "done" report is a claim, not evidence. Check the diff exists.
    2. When a behavior keeps drifting despite a memory/rule, make it deterministic
       (a hook the harness enforces) rather than asking the agent to self-police.
    3. Self-check _prompts_ ("am I doing this right?") don't catch this class of
       failure — the failing agent believed it was working. Enforce + verify.

---

### 2026-06-25 — Coverage reporter silently drops Prisma-importing files → days lost chasing a blocking gate

- **Symptom:** Building the coverage backfill to flip CI from report-only → blocking, executed source modules that import `@/lib/db` (services, DB actions) never appeared in the coverage report — read as absent/0% while unrelated files showed fine. So a 100% `lib`/`app_actions` gate could not be honestly evaluated.
- **Root cause:** a Vitest 4 + coverage interaction (reproduced on **both** `@vitest/coverage-v8` and `@vitest/coverage-istanbul`, versions aligned): executed modules that import the Prisma client load through a path that bypasses coverage instrumentation and get dropped from the report. Independent of `vi.mock`, jsdom/node mixing, prisma inlining, or `vite-tsconfig-paths`. Likely Node 24 + Prisma module-load. Compounded by chasing many hypotheses (provider swap, projects, single-process, env-unification) before isolating the one variable: **does the file import Prisma?**
- **Fix / decision:** stopped gating on the number. **DB layer → integration tests** against real Postgres (no `vi.mock("@/lib/db")`); **everything else → unit tests**; **coverage advisory**; **CI gate = tests passing (unit + integration).** [ADR-0012](./decisions/0012-integration-tests-for-db-layer.md) + [`testing.md`](./conventions/testing.md).
- **Lessons for next time:**
    1. **Before adopting a coverage gate, prove the reporter attributes coverage to the files you mean to gate** — one tiny test against one representative file. An absent/0% row for a file you know ran is the tell; don't build a policy on an unverified reporter.
    2. When a tool misbehaves, **isolate the single differentiating variable early** instead of cycling configs (provider/projects/env carousel cost most of the time here).
    3. **"Covered" for DB code = a real integration test that passes**, not a line-coverage %. Don't unit-mock the database.

---

### 2026-06-24 — Browser-reviewed a FE slice against a stale dev server → chased phantom CSS bugs

- **Symptom:** Re-skinning login (1.10), the live `/login` showed a white (invisible) Sign-in button, invisible inputs, dark page bg, full-height card. Spent several Playwright passes inspecting computed styles before finding `--muted`/`--primary` **unset** and `--foreground` = an old `#171717` — i.e. every theme token + new `md:` utility was missing from the served CSS. The source was correct against `main`; the running `pnpm dev` had been started **before slice 1.9's `globals.css` tokens merged**, and Tailwind's theme/utility layer never recompiled (TSX hot-reloaded, CSS did not).
- **Root cause:** two compounding things. (1) Tailwind v4 doesn't reliably recompile the theme/utility layer on `@theme`/token changes — the **exact** failure already logged 2026-06-23. (2) The dev server outlived a `main` merge, so its CSS predated tokens the branch depends on. The review trusted a long-lived server instead of a fresh build.
- **Fix / decision:** Restart the dev server before any FE browser review. **Operating-model change (user-ratified 2026-06-24** — "you handle the server, so you can restart whenever it's needed"**):** the agent now **owns the dev-server lifecycle** — start/restart it whenever needed (superseded the prior "user keeps `pnpm dev` running, don't touch it" rule). Before screenshotting an FE slice, (re)start `pnpm dev` so the CSS is built from the current branch.
- **Lessons for next time:**
    1. A real-browser FE check is only valid against a **freshly built** server. Restart `pnpm dev` first — especially after `globals.css`/`@theme` edits or after `main` moved under a long-running server.
    2. When live styles contradict correct source, suspect a **stale build before suspecting the code** — check a token's computed value (`getComputedStyle(:root)`) early; an `(unset)` token is the tell.
    3. This is the 2026-06-23 Tailwind-theme-HMR lesson recurring with a new trigger (server outliving a merge). The durable fix is owning the server lifecycle, not remembering to restart ad hoc.

---

### 2026-06-23 — Tailwind v4 `@theme` edits need a dev-server restart

- **Symptom:** After adding tokens to `app/globals.css` (`@theme inline` + new
  `:root` vars), the running `pnpm dev` kept serving the OLD compiled CSS — new
  utilities (`bg-primary`, `text-positive`, `bg-bucket-*`) weren't emitted, so
  buttons looked unstyled on the live server even though the source was correct.
- **Root cause:** Tailwind v4 HMR does not reliably recompile the **theme layer**
  when `@theme`/token definitions change; the dev server must be restarted to
  pick them up.
- **Lesson:** After editing `@theme` or token vars in `globals.css`, **restart
  `pnpm dev`** before judging the result. Don't conclude "components are
  unstyled" from a stale dev server — verify against a fresh build (or
  `tailwindcss` CLI compile) first.

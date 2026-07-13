# Lessons Learned

A running log of topics where an agent (or the team) hit avoidable friction —
the root cause and the fix — so we don't relitigate the same problem. Append
newest at the top. Keep entries short.

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

---

### 2026-06-28 — Two agents shared one checkout → branch switched out from under a slice, trees intermingled

- **Symptom:** Mid-way through shipping slice 1.7, `git add -A` swept up 7 unrelated files (an architecture-DI refactor) alongside the 1.7 work, and the branch had silently changed from `feat/1.7-observability` to `refactor/architecture-di`. A blind commit would have mixed two agents' work and wrongly deleted `expense.service.ts` on the 1.7 PR.
- **Root cause:** a second agent was launched to work "in parallel" but in the **same working directory** (`git worktree list` showed one checkout). A shared checkout = a shared HEAD + index: the other agent's `git checkout` switched the branch for both sessions, and its uncommitted files landed in the same tree as the 1.7 changes.
- **Fix / decision:** Recovered by switching back to the slice branch, staging only the 18 known 1.7 files **explicitly** (never `-A`), verifying `git diff --cached --stat`, committing, then restoring the other agent's branch. Codified a **parallel-work policy** (CLAUDE.md §Session startup): survey open slices/branches/PRs before parallel work, and with ≥2 branches active, isolate each agent in its own `git worktree`.
- **Lesson for next time:** Two agents must never share one working directory — the moment a second concurrent branch exists, give each its own worktree. And before any commit in a shared/dirty tree, review the **staged set explicitly** (`git diff --cached --stat`); `git add -A` is how foreign work sneaks into a PR.

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

### 2026-06-17 — Opened a slice PR with no review pass → a silent-failure bug shipped into the PR

- **Symptom:** 1.4 (capture) went implement → open PR (#18) with **no adversarial review step**. A `/review-changes` pass (run by the user) then found a **Critical**: `createExpense` had no error handling around the DB write and the form didn't catch it → DB failures would silently do nothing (no user feedback). Plus a data-integrity Warning (subcategory not validated against category). Both were invisible to the unit tests — "silent failure" / "state-UI" class issues an adversarial review or browser run surfaces.
- **Root cause:** the review step was treated as optional and skipped. Mode 2 said "reviewer before merge" but nothing made it a hard gate, and the `reviewer` agent's criteria didn't yet match the `/review-changes` adversarial lens.
- **Fix / decision:** made the **review loop mandatory** before any slice PR (CLAUDE.md §How to Work, `agent-workflow.md` §Review handoff): implement → review (full `/review-changes` criteria + a real-browser check for FE slices) → fix every Critical/Warning → re-review → repeat until clean → _then_ open the PR. Aligned `reviewer.md` criteria with `/review-changes`. Fixed the 1.4 bugs with tests.
- **Lessons for next time:**
    1. No slice PR without a clean adversarial-review pass. Tests catch what you thought of; review catches the silent-failure / hidden-state classes you didn't.
    2. FE slices get a real-browser check (dev server + Playwright MCP), not just unit tests.
    3. Keep the `reviewer` agent's criteria in sync with the `/review-changes` skill.

---

### 2026-06-16 — Dispatched `implementer` ran in a divergent environment → phantom output, nothing reached the repo

- **Symptom:** the `implementer` subagent (for slice 1.4) reported a `git log` and files that don't exist in our repo (commits `ef27f64` / `9bb46d7 "configure shadcn/ui"`, a different `phase-1-foundation.md`, an empty `README.md`). Its 108KB of "work" never touched our checkout — the real tree stayed clean at `74ffba3`, nothing committed/pushed/PR'd. Caught only by manually diffing its output against `git log`.
- **Root cause:** the subagent operated on a stale/isolated/phantom working tree, and **nothing verified it was on the real repo before it worked**. The branch it should have used (`feat/1.4-capture-modal`) was local-only, so an isolated env couldn't even see it. No env preflight existed for subagents.
- **Fix / decision:** added a `SubagentStart` hook [`.claude/hooks/env-check.sh`](./.claude/hooks/env-check.sh) that asserts `git merge-base --is-ancestor origin/main HEAD` (HEAD contains current `origin/main`) and warns loudly on mismatch; plus a **Step-0 HARD GATE** in `.claude/agents/{implementer,reviewer}.md` telling the agent to run the same check and STOP if it fails (survives even if an isolated env never loads the hook). Recovered by implementing 1.4 inline in the verified-clean checkout.
- **Lessons for next time:**
    1. Never trust a subagent's output without checking it landed on the real tree (`git log`/`git status` in the main checkout) — same "verify, don't trust" family as the merge-state lesson.
    2. The invariant for "am I on the real repo": HEAD must contain current `origin/main`. Build it into agent start-up, not just human vigilance.
    3. A hook only fires where the agent's env loads `.claude/` — back it with an in-prompt preflight so the guard travels with the agent.

---

### 2026-06-05 — Stacked PR merged into its (already-merged) base branch → migration stranded off `main`

- **Symptom:** A feature was split into PR A (engine) and PR B (docs migration), with **B stacked on A's branch**. PR A (#11) was merged to `main` first; PR B (#12) was then merged — but into its base `chore/roadmap-status-derivation`, _after_ that branch had already gone to `main`. GitHub reported #12 "merged," yet its 13-file migration (ADR, phase trims, conventions) never reached `main`. Needed a recovery PR (#13) from the orphaned branch → `main`.
- **Root cause:** stacked-PR merge order was never stated to the user up front. With `main ← A ← B`, merging A→main then B-into-A's-branch strands B: A's branch is now a dead-end relative to `main`, so B's commits land nowhere useful. "Merged" on GitHub means "merged into its base," not "reached `main`."
- **Fix / decision:** opened recovery PR #13 (`chore/roadmap-status-derivation` → `main`); its diff was exactly B's changes (everything up to A's commit already on `main`). Going forward, **state the explicit safe merge order whenever announcing dependent PRs**, and prefer basing a follow-up on `main` with a "merge after #N" note when stacking isn't essential.
- **Lessons for next time:**
    1. For a stack `main ← A ← B`: **either** merge B into A's branch first then A→main (A carries both), **or** merge A→main, retarget B's base to `main`, then merge B. Never A→main then B-into-A's-branch.
    2. When opening dependent PRs, hand the user the exact merge sequence in the announcement — not buried in a PR description.
    3. After each merge, verify it actually landed on `main` (`git fetch` + check), since GitHub's "merged" can mean merged into a non-`main` base.

---

### 2026-06-01 — Trusted stale local git refs at session start → invented a false "unmerged dependency" blocker

- **Symptom:** Picking up slice 0.3, the agent read the session-start `gitStatus` snapshot + local refs showing `main` at `6f1dc56` and the harness-docs branch "3 commits ahead, unmerged, no PR." It surfaced a false chicken-and-egg to the user ("`main` lacks the conventions this slice must follow — how should I branch?") and asked which base to use. In reality PR #4 had merged those docs into `origin/main` (`c0311df`) _before the session began_. A single `git fetch` dissolved the entire confusion.
- **Root cause:** never ran `git fetch` before reasoning about branch state. The CLAUDE.md startup ritual read docs but had no "sync git with remote" step, and the harness-provided `gitStatus` is an explicitly point-in-time snapshot that goes stale the instant anything merges. Rule #13's "branch off up-to-date `main`" was applied to refs that were 4 commits behind — so "up-to-date" was assumed, never verified.
- **Fix / decision:** Added a mandatory **step 1** to CLAUDE.md § Session startup: `git fetch origin` + confirm local `main` matches `origin/main` before any branch reasoning. Updated `implementer.md` Process step 1 to `git fetch origin && git checkout main && git pull --ff-only` before cutting the branch. Rule of thumb: if local state implies a blocker, fetch to confirm it's real before escalating to the user.
- **Lessons for next time:**
    1. `git fetch origin` before any branch-base decision. Local refs and the startup `gitStatus` snapshot are stale by default — a merge may have landed between sessions.
    2. When local state implies a blocker (unmerged dep, missing baseline, divergence), **verify against `origin` before escalating** — don't make the user resolve a phantom.
- **Recurred 2026-06-05:** cut `chore/sizing-conventions` with `git checkout -b` off **un-synced local `main`** (`3879b22`, #13) instead of the current `origin/main` (`0b05ea6`, #14) — so the branch started 2 commits behind and PR #15 showed "out of date." I had run `git fetch` and _read_ `origin/main`'s tip, but never fast-forwarded **local** `main` before branching. Fixed by merging `origin/main` into the branch (rebase+force-push is blocked by the deny-list). **Hardened rule:** reading `origin/main`'s tip is **not** syncing local `main`. Before any `git checkout -b`, run `git fetch origin && git switch main && git pull --ff-only && git switch -c <branch>` — as one sequence. This applies to the **main thread creating branches mid-session**, not just `implementer`/session-start (the prior fix only covered those).

---

### 2026-05-31 — Status updates lagged behind merges → stale handoff between sessions

- **Symptom:** After 0.2 merged, the roadmap still showed 0.2 as active and no 0.3 brief was staged — a fresh session would read stale "where are we." Separately, the first 0.3 attempt was lost: an `implementer` running in a worktree built on a _different_ baseline (no shadcn, Next 16.0.1, vitest 3) and its `feat/0.3-ci` branch never reached our origin.
- **Root cause:** the slice lifecycle updated a slice's own status but never reliably advanced the global "Currently active" pointer or staged the next brief — and that bookkeeping got deferred to "after merge / next session," so the state lived only in chat. The worktree isolation also silently diverged from the real repo without anyone verifying the branch landed.
- **Fix / decision:** the **repo is the handoff** — defined a "cold-resumable" Definition of Done in [`session-handoff.md`](./conventions/session-handoff.md). Status/pointer/brief updates happen **in the slice PR** (worker = its own slice only; orchestrator = the shared "Currently active" pointer, serially). The `reviewer` gate now rejects PRs that aren't cold-resumable or that edit the shared pointer / another slice's section. Default to a **plain branch off `main`** for a single in-flight slice; reserve worktrees for genuine parallel slices.
- **Lessons for next time:**
    1. Leave `main` cold-resumable in **every** slice PR — a blank session must resume from the startup docs alone.
    2. Shared state (the roadmap pointer) gets a **single serial writer** (the orchestrator); workers touch only their own slice — this is what makes parallel slices safe.
    3. After invoking an `implementer`, **verify its branch + commits actually landed on our origin** before trusting the result.

---

### 2026-05-31 — DB + deploy strategy churned through ~5 reconfigurations for lack of upfront topology planning

- **Symptom:** Slice 0.2 (Vercel + Neon) thrashed across many turns and sessions: manual `DATABASE_URL`/`DIRECT_URL` typed at Vercel import → Neon-Managed integration → per-PR Neon preview branches → finally **"Neon = production only" + Docker for local/CI**. Along the way we created then abandoned a Neon `dev` branch, connected/disconnected the integration, deleted duplicate env vars, hit a `vercel-dev` branch-name conflict on reconnect, and rewrote ADR-0004 + `deployment.md` three times.
- **Root cause:** started clicking in dashboards (entered env vars at import) **before deciding the per-environment data topology** — which environments exist (local / CI / preview / prod), where each one's database lives, which integration mode, and the env-var contract. Also didn't read the Neon×Vercel integration tradeoffs (Vercel-Managed vs Neon-Managed vs manual; static vs dynamic preview vars; that a live serverless preview can't be backed by an ephemeral container DB) until mid-setup, despite having MCP doc access the whole time.
- **Fix / decision:** Settled the architecture in [ADR-0004](./decisions/0004-db-environment-isolation.md): Docker Postgres for local + CI, Neon `production` branch only for real data, previews build-only (no DB), prod env vars set manually, `migrate deploy` guarded to `VERCEL_ENV=production`. Standardized on `DATABASE_URL` + `DATABASE_URL_UNPOOLED`.
- **Lessons for next time:**
    1. For any slice that wires a new external platform/integration (DB, hosting, auth, email), write a short **environment & data-topology plan FIRST**: list every environment, where its data/secrets live, the integration mode + cost tier, and the env-var contract — and confirm with the user **before** touching a dashboard.
    2. Read the platform's integration docs up front (Neon / Vercel / Context7 MCP doc access exists). The decisive tradeoffs (e.g. a live preview can't use a container DB) are cheap to learn before, expensive after.
    3. Don't enter config in a third-party dashboard until the topology is decided — dashboard state is the hardest thing to cleanly undo (orphaned branches, duplicate env vars, name conflicts).
    4. Confirm the cost/tier (free vs paid) early; it shapes the design and the user cares.

---

### 2026-05-27 — Prisma 7 broke the `directUrl` pattern; downgrade dance ate several turns

- **Symptom:** Slice 0.1's `pnpm prisma generate` failed with `error: The datasource property directUrl is no longer supported in schema files`. Trying to pin Prisma 6 then required re-running install, getting `[ERR_PNPM_IGNORED_BUILDS]` for `@prisma/engines`, then for `@prisma/client` separately on v6, then re-running `pnpm install` each time before generate would proceed. Roughly 5 round-trips before migrate worked.
- **Root cause:**
    - `pnpm create next-app@latest` + `pnpm add prisma` resolved Prisma to `7.8.0` (the current `@latest`). Prisma 7 moved datasource URLs out of `schema.prisma` into a new `prisma.config.ts` API — the well-documented `directUrl = env("DIRECT_URL")` pattern in the datasource block stopped parsing.
    - pnpm v11 prompts for explicit `allowBuilds` decisions on packages with native postinstalls. The scaffold generated a `pnpm-workspace.yaml` with `allowBuilds` placeholders but didn't decide for us. Each new install (prisma, then @prisma/client at v6) added a fresh undecided entry.
    - Prisma CLI does not auto-load `.env.local` — only `.env` — so `prisma migrate dev` couldn't see `DIRECT_URL` without `dotenv-cli` wrapping.
- **Fix / decision:**
    - Pin Prisma to `^6` (latest 6.x = 6.19.3) in `package.json` until `prisma.config.ts` patterns stabilize and we have a clear migration path. Documented in slice 0.1's PR description.
    - In `pnpm-workspace.yaml`: explicitly approve `@prisma/client: true`, `@prisma/engines: true`, `prisma: true`; deny `sharp`, `unrs-resolver`, `msw`.
    - Add `dotenv-cli` as a dev dep; wrap `db:migrate` script: `"db:migrate": "dotenv -e .env.local -- prisma migrate dev"`.
- **Lessons for next time:**
    1. Check the **current major** of any tool the Plan block names before scaffolding. Plan blocks written even days ago may assume the previous major's API.
    2. When `pnpm create <app>@latest` is used, immediately verify resolved versions of critical deps (Prisma, Next, React) before deeper work. A `pnpm list --depth 0` early surfaces version surprises while pivoting is cheap.
    3. For Prisma + Neon specifically: `directUrl` in `datasource` is a Prisma 6 pattern. Until we adopt Prisma 7's `prisma.config.ts`, pin `^6`.
    4. Anything in the project that needs values from `.env.local` (not `.env`) must wrap with `dotenv-cli` or be invoked via `next` (which loads `.env.local` itself).
    5. The pnpm v11 `allowBuilds` allowlist must be filled out **before** running CLI tools that depend on those builds (Prisma, sharp), otherwise the install loop short-circuits with cryptic errors.

---

### 2026-05-26 — Setting a base Node version took far too many turns

- **Symptom:** Picking and wiring up the project's Node version dragged across
  many back-and-forth turns instead of being a quick setup step.
- **Root causes:**
    - `node`/`pnpm` were not available in the **non-interactive shells** that
      agents use. nvm is lazy-loaded from `~/.zshrc` (interactive-only), so the
      `node` shim recursed (`_nvm_lazy_load` undefined) in non-interactive shells.
    - The toolchain was not verified in a non-interactive shell **first**, before
      committing to an approach.
    - The Node landscape had shifted: Node 20 (the original plan's pick) reached
      end-of-life on 2026-04-30, invalidating a months-old assumption.
    - A bespoke `~/.zshenv` function was drafted to scope versions per project —
      non-standard, and rightly rejected in favor of a standard approach.
- **Fix / decision:** Node 24 (active LTS, Vercel's default) as the nvm default;
  expose it on PATH via `~/.zshenv` so non-interactive/agent shells see it; drop
  `node/npm/npx` from the `~/.zshrc` lazy-shim loop; pin in-repo via `.nvmrc`
    - `package.json` `engines`; pnpm via corepack. `nvm use <v>` still overrides
      per project (e.g. Blend on Node 22).
- **Lessons for next time:**
    1. Verify prerequisites (`node`, `pnpm`, etc.) in a **non-interactive** shell
       at the very start of environment setup — not midway through.
    2. Confirm current LTS / EOL status before pinning a runtime; don't trust a
       plan written months earlier.
    3. Prefer standard tooling and patterns over bespoke shell code. If a custom
       approach is truly required, flag it explicitly as non-standard.
    4. nvm is interactive-oriented; automation needs the version on PATH (e.g.
       via `~/.zshenv`), not behind interactive-only lazy-load functions.

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

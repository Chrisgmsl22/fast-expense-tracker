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

### 2026-06-17 — Opened a slice PR with no review pass → a silent-failure bug shipped into the PR

- **Symptom:** 1.4 (capture) went implement → open PR (#18) with **no adversarial review step**. A `/review-changes` pass (run by the user) then found a **Critical**: `createExpense` had no error handling around the DB write and the form didn't catch it → DB failures would silently do nothing (no user feedback). Plus a data-integrity Warning (subcategory not validated against category). Both were invisible to the unit tests — "silent failure" / "state-UI" class issues an adversarial review or browser run surfaces.
- **Root cause:** the review step was treated as optional and skipped. Mode 2 said "reviewer before merge" but nothing made it a hard gate, and the `reviewer` agent's criteria didn't yet match the `/review-changes` adversarial lens.
- **Fix / decision:** made the **review loop mandatory** before any slice PR (CLAUDE.md §How to Work, `agent-workflow.md` §Review handoff): implement → review (full `/review-changes` criteria + a real-browser check for FE slices) → fix every Critical/Warning → re-review → repeat until clean → _then_ open the PR. Aligned `reviewer.md` criteria with `/review-changes`. Fixed the 1.4 bugs with tests.
- **Lessons for next time:**
    1. No slice PR without a clean adversarial-review pass. Tests catch what you thought of; review catches the silent-failure / hidden-state classes you didn't.
    2. FE slices get a real-browser check (dev server + Playwright MCP), not just unit tests.
    3. Keep the `reviewer` agent's criteria in sync with the `/review-changes` skill.

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

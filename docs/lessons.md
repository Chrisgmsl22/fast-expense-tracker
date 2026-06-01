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
  + `package.json` `engines`; pnpm via corepack. `nvm use <v>` still overrides
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

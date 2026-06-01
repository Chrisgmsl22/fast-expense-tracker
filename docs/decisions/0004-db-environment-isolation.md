# ADR-0004: Per-Environment Database Isolation

**Status**: Accepted
**Date**: 2026-05-31
**Deciders**: Christian (via Claude harness)

---

## Context

fast-expense-tracker is single-user, but **production data must never be used
for development, testing, or preview debugging**. The app runs on Vercel with
Postgres on Neon. We want clear environment isolation, low setup cost, and zero
ongoing spend — and we want **Neon to hold real data only**.

Early 0.2 iterations tried a single shared `DATABASE_URL` (previews hit prod),
then a Neon-Managed Vercel integration with per-PR Neon preview branches. We
ultimately decided the integration's preview branches add cloud surface we don't
need: a single-user, agent-led project is reviewed by running locally and via
CI, not by clicking live preview URLs with data.

---

## Decision

Databases are split by **where the code runs**. Neon hosts exactly one branch:
production.

| Environment | Database | Mechanism |
|---|---|---|
| Local dev | **Docker Postgres** (`docker-compose.yml`, `postgres:17`) | `pnpm db:up`; `.env.local` → `localhost` |
| CI integration tests | **GitHub Actions Postgres service container** (ephemeral) | per-job; **lands in Phase 1** when DB-touching tests exist |
| Preview (per PR) | **none** | preview deploy builds only (compile/build check); no DB |
| Production | **Neon** `production` branch | manual Vercel env vars, Production scope only |

### Why no preview database

- A live Vercel preview deploy needs a **network-reachable** DB; a CI/Docker
  container is ephemeral and unreachable from Vercel, so it can't back one.
  Giving previews a real DB would require a cloud branch (Neon) — which we're
  deliberately avoiding.
- A single-user, agent-led project is reviewed by **running locally** and via
  **CI integration tests**, not by clicking preview URLs with data.
- Keeps Neon to a single job — real production data — and removes any path for
  prod data to land in a non-prod branch.
- Reversible: if Phase 1+ review needs live DB-backed previews, re-enable the
  Neon-Managed integration's preview branching.

### Production connection

The Neon-Managed Vercel integration is **disconnected** (its value was preview
branching). Production uses a **manual connection**: `DATABASE_URL` +
`DATABASE_URL_UNPOOLED` set in Vercel **Production scope only**, from the
`production` branch.

### Environment variable convention

- `DATABASE_URL` — pooled connection, app runtime.
- `DATABASE_URL_UNPOOLED` — direct connection, Prisma migrations.

`prisma/schema.prisma` uses `directUrl = env("DATABASE_URL_UNPOOLED")`. Locally
(Docker, no pooler) both point at the container and are identical.

### Migrations on deploy

Vercel build command migrates **production only** (previews have no DB):

```
if [ "$VERCEL_ENV" = "production" ]; then prisma migrate deploy; fi && next build
```

Local migrations run against Docker via `pnpm db:migrate`.

### Postgres parity

Docker pins `postgres:17` to match Neon. Residual differences (PgBouncer
pooling, Neon serverless driver) only exist in production and are low-risk for
plain SQL via Prisma.

---

## Consequences

**Positive**

- Neon holds real data only; nothing non-prod can ever touch it.
- Dev and CI are offline, free, reproducible.
- One env-var convention everywhere; no integration machinery to reason about.

**Tradeoffs / negative**

- **No live DB-backed preview URLs.** Per-PR previews still build (catch build
  breaks) but DB-dependent pages won't work there; review happens locally + via
  CI tests. Re-enable Neon previews later if this becomes painful.
- Build command needs the `VERCEL_ENV` guard so `migrate deploy` doesn't run
  (and fail) on preview builds.
- Cleanup: the interim Neon `dev`, `vercel-dev`, and any `preview/*` branches
  are now **superseded and should be deleted** — only `production` remains.
- Two Postgres flavors (Docker locally, Neon in prod); mitigated by pinning 17.

---

## Alternatives considered

- **Neon-Managed integration with preview branches** — gives clickable previews
  with isolated data (free, auto-cleaned), but adds cloud surface and a path for
  prod data into non-prod branches. Rejected for simplicity / "Neon = real data
  only"; reversible if needed.
- **Neon branch for local dev** — couples local work to the cloud; replaced by
  Docker.
- **Separate Neon projects per environment** — manual schema sync, overhead.
- **Neon branch per CI run** — needs a Neon API key as a CI secret; a container
  is simpler and free.

---

## References

- [ADR-0003](./0003-env-secrets-handling.md) — environment & secrets handling
- [docs/conventions/deployment.md](../conventions/deployment.md) — deploy + DB process
- Neon docs: manual Vercel connection; Postgres service container in GitHub Actions

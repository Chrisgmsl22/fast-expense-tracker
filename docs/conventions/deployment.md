# Deployment

How fast-expense-tracker deploys, and how databases map to environments.
Rationale: [ADR-0004](../decisions/0004-db-environment-isolation.md).

## TL;DR

- **Neon holds real data only** — a single `production` branch.
- **Local + CI** use **Docker Postgres** (`docker-compose.yml`), never Neon.
- **Preview deploys** are **build-only** — no database.
- **Production** reads manually-set Vercel env vars from the Neon `production` branch.

## Platform

- **Vercel**, GitHub-integrated. Framework auto-detected (Next.js), Node 24.
- Push a branch → **preview** deploy (build/compile check, no DB).
- Merge to `main` → **production** deploy.
- No `vercel.json`; settings live in the Vercel dashboard.

## Database per environment

| Environment | Database | How |
|---|---|---|
| Local dev | Docker Postgres (`postgres:17`) | `pnpm db:up`; `.env.local` → `localhost` |
| CI integration tests | GH Actions Postgres service container | per-job, ephemeral (**Phase 1**) |
| Preview (per PR) | none | build-only; DB pages won't work in preview |
| Production | Neon `production` branch | manual Vercel env vars, Production scope |

## Build command

Set in **Vercel → Settings → Build and Deployment** (Override on). Migrations
run on **production only** — previews have no DB, so guard with `VERCEL_ENV`:

```
if [ "$VERCEL_ENV" = "production" ]; then prisma migrate deploy; fi && next build
```

(If `prisma` ever fails to resolve on the runner, use `pnpm exec prisma ...` /
`pnpm build`.)

## Production env vars (manual)

The Neon-Managed Vercel integration is **not** used (its value was preview
branching, which we don't want). Set these in **Vercel → Settings →
Environment Variables**, **Production** scope only, from the Neon `production`
branch:

- `DATABASE_URL` — pooled (PgBouncer) endpoint, app runtime.
- `DATABASE_URL_UNPOOLED` — direct endpoint, Prisma migrations.

Never commit real values; only `.env.example` is tracked
([ADR-0003](../decisions/0003-env-secrets-handling.md)).

## Local development

```bash
pnpm db:up                 # start Docker Postgres
cp .env.example .env.local # defaults already match the container
pnpm db:migrate            # apply migrations to the local DB
pnpm dev
```

`pnpm db:down` stops the container. Data persists in a named Docker volume.

## Rollback

Vercel Dashboard → **Deployments** → pick a previous production deploy →
**Promote / Rollback**.

## Verifying a deploy

- **Preview:** the deploy builds green (compile check). DB-backed pages are
  expected to error — previews have no database by design.
- **Production:** deploy is `READY`, `prisma migrate deploy` ran in the build
  log, and the prod URL loads after merge to `main`.

## First-time / external setup

See [docs/operations/setup.md §3](../operations/setup.md).

# ADR-0001: Tech Stack — Next.js + Postgres + Vercel

Date: 2026-05-24
Status: Accepted

## Context

fast-expense-tracker is a temporary personal expense tracker. Constraints:

- **Single user** (the project owner). No multi-tenancy.
- **Time-to-live URL is the priority.** This is a stop-gap while MoneyFlow
  (the long-form learning project) is built.
- **Mobile + desktop access** required for weekly review + on-the-go logging.
- **Zero ongoing cost** if possible. Free tiers only.
- **Migration-friendly schema** — when MoneyFlow ships, data should move
  cleanly into MoneyFlow's Postgres.
- **Agent-led development** — the stack must be productive for agents to
  implement against, with strong types and clear patterns.
- **Repo is public** — secret hygiene matters from day one.

Options considered:

1. **Next.js (App Router) + Postgres (Neon) + Vercel** — full-stack TypeScript, server actions, free hosting.
2. **Vite + React + Express + Postgres** — closer to MoneyFlow's architecture but two services to deploy.
3. **SQLite + local web app** — radically simple, but breaks mobile-from-anywhere.

## Decision

Stack:

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict)
- **Database**: Postgres on Neon (free tier, ~0.5 GB)
- **ORM**: Prisma
- **Styling**: Tailwind CSS + shadcn/ui components
- **Charts**: Recharts (subject to revisit in Phase 4 — see open question)
- **Auth**: Auth.js (NextAuth v5) with Credentials provider
- **Hosting**: Vercel (free tier, GitHub-integrated deploys)
- **CI**: GitHub Actions (lint + typecheck + Vitest + Playwright smoke)
- **Unit tests**: Vitest + React Testing Library
- **E2E tests**: Playwright

## Consequences

**Positive:**

- **Single codebase, single deploy.** Server actions replace REST endpoints for most mutations.
- **Free.** Vercel free tier + Neon free tier = $0/month at our scale.
- **Mobile-friendly out of the box.** Next.js + Tailwind responsive design.
- **Migration is `pg_dump | pg_restore`.** Same Postgres, same Prisma schema (subset of MoneyFlow's).
- **Strong typing end-to-end.** TypeScript + Prisma + Zod inference = agents have type-level guard rails.
- **shadcn/ui components are copied into the repo**, not installed as a dep. We own the component code; agents can modify them.

**Negative:**

- **Next.js conventions are unfamiliar to me (the user) at first.** Counter-balanced by this being the "fast" repo where agents write — learning curve is paid by reviewing, not authoring.
- **Server Actions feel magical** until you've used them. Trades explicitness for less code.
- **Auth.js v5 is still in beta-ish state** as of writing. Mitigated by it being from a maintained, widely-used library.
- **Vercel free tier limits**: 100 GB-hours/month, 12 serverless function executions/sec. We are nowhere near this at 1 user.

## Open questions

These do not block ADR acceptance but should be resolved during their phases:

- **Charts library** (Recharts vs Tremor vs visx): decided during Phase 4 (Dashboard).
- **Pre-commit hook tool** (Husky vs lefthook): decided during Phase 0.
- **Password hashing** (bcrypt vs argon2): decided during Phase 2 (Auth).
- **Rate-limiting** (Vercel KV vs Upstash vs none for v1): decided during Phase 2.

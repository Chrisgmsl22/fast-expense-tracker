# fast-expense-tracker

A temporary personal expense tracker built while [MoneyFlow](https://github.com/Chrisgmsl22/my-expense-tracker)
(the long-form learning project) is being built.

**Why this exists:** MoneyFlow takes months. I need a working tool now to track
shared expenses with a proper 68/32 split, categorize spend, and watch budgets.
This app is the temporary bridge.

**What's different:** this repo is intentionally an *agent-led* project — agents
write the code, I review. The opposite of MoneyFlow, which is hand-written for
learning. Same code-quality bar, but speed > deliberate practice.

## Stack

- Next.js 16 (App Router) — TypeScript end-to-end, strict mode
- Postgres on Neon — same shape as MoneyFlow's schema for easy migration later
- Prisma ORM
- Tailwind CSS + shadcn/ui
- Auth.js (Credentials provider) — *lands in Phase 1*
- Hosted on Vercel

## Getting started

### Prerequisites

- **Node 24.x** — the repo pins it via `.nvmrc` and `package.json` `engines`. With nvm: `nvm use` (or `nvm install 24`).
- **pnpm** — `npm install -g pnpm`.
- **A Neon Postgres database** — free tier is enough. See [docs/operations/setup.md §1–2](./docs/operations/setup.md) for the full one-time external setup (Neon project, connection strings).

### Run it locally

```bash
# 1. Install dependencies
pnpm install

# 2. Create your local env file and fill in the Neon connection strings
cp .env.example .env.local
#   DATABASE_URL  — pooled (PgBouncer) endpoint, used at runtime
#   DIRECT_URL    — direct endpoint, used by Prisma migrations
#   (both come from your Neon dashboard — see setup.md §2)

# 3. Apply database migrations
pnpm db:migrate

# 4. Start the dev server
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

> Secrets live only in `.env.local` (gitignored) — never commit real connection
> strings. See [ADR-0003](./docs/decisions/0003-env-secrets-handling.md).

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the Next.js dev server (hot reload) |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Type-check with `tsc --noEmit` (no emit) |
| `pnpm test` | Run the Vitest suite once |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:migrate` | Create + apply a migration in dev (reads `.env.local`) |
| `pnpm db:migrate:deploy` | Apply pending migrations (CI / production) |

## Where to find things

| You want to know… | Look here |
|---|---|
| Project goals + non-goals | [docs/specs/0001-initial-design.md](./docs/specs/0001-initial-design.md) |
| Current phase + what's next | [docs/roadmap/README.md](./docs/roadmap/README.md) |
| One-time external setup (Neon, Vercel, env) | [docs/operations/setup.md](./docs/operations/setup.md) |
| Why a design choice was made | [docs/decisions/](./docs/decisions/) |
| Data model + seed data + shared-expense math | [docs/reference/domain-reference.md](./docs/reference/domain-reference.md) |
| Coding conventions | [docs/conventions/coding-conventions.md](./docs/conventions/coding-conventions.md) |
| How agents work on this repo | [docs/conventions/agent-workflow.md](./docs/conventions/agent-workflow.md) |
| AI assistant instructions | [CLAUDE.md](./CLAUDE.md) |

## License

Personal project. No license intended for reuse.

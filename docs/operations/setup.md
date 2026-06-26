# Setup

External / manual setup needed to run this project. Organized by **when
each step becomes a blocker** so you can do them just-in-time, not all
upfront. Check items off as you complete them.

All sensitive values (DB URLs, API keys, secrets) go in `.env.local`
(gitignored) for local dev and Vercel env vars for deployed environments —
per [ADR-0003](../decisions/0003-env-secrets-handling.md). Never commit
real values.

---

## 1. Before any slice — local dev environment

One-time setup on your machine.

- [ ] Install Node 24.x LTS via nvm (`nvm install 24`) — matches the repo `.nvmrc` / `engines`
- [ ] Install pnpm: `npm install -g pnpm`
- [ ] Clone the repo locally
- [ ] (Optional) Install Prisma extension for VS Code or your editor of choice

---

## 2. Before slice 0.1 — Neon database

A Postgres instance for local development and (later) production.

- [ ] Sign in at https://neon.tech (free tier is sufficient — 0.5 GB)
- [ ] Create a project: name `fast-expense-tracker`
- [ ] Region: pick the closest to where Vercel deploys (US-East default is fine for most cases)
- [ ] Open the project's **Connection Details** page
- [ ] Copy the **pooled** connection string — used at app runtime (Next.js)
- [ ] Copy the **direct** connection string — used by Prisma migrations
- [ ] Locally: create `.env.local` (gitignored — never commit; see ADR-0003)
- [ ] Add `DATABASE_URL="<pooled-url>"` to `.env.local`
- [ ] Add `DIRECT_URL="<direct-url>"` to `.env.local`
- [ ] Verify after slice 0.1 lands: `pnpm prisma migrate dev` connects successfully

Notes:

- The pooled URL goes through Neon's PgBouncer; the direct URL bypasses it (required for migrations).
- See Prisma's Neon guide: https://www.prisma.io/docs/orm/overview/databases/neon

---

## 3. Before slice 0.2 — Vercel project

A Vercel project linked to the GitHub repo for preview + production deploys.

- [ ] Sign in at https://vercel.com (free Hobby tier is sufficient)
- [ ] Import the GitHub repo as a new project
- [ ] Framework preset: Next.js (auto-detected)
- [ ] Root directory: `./` (default)
- [ ] **Do NOT trigger the first deploy yet** — env vars must be set first
- [ ] Project Settings → Environment Variables, add:
    - `DATABASE_URL` = your Neon pooled URL — Production + Preview scopes
    - `DIRECT_URL` = your Neon direct URL — Production + Preview scopes
- [ ] Now trigger the first deploy (push a branch, open PR, or trigger from dashboard)
- [ ] Verify the preview URL loads the placeholder page from slice 0.1

---

## 4. After slice 0.3 ships — GitHub branch protection

Protect `main` once CI exists to gate against.

- [ ] GitHub → repo Settings → Branches → Add branch protection rule
- [ ] Branch name pattern: `main`
- [ ] ✅ Require a pull request before merging
- [ ] ✅ Require status checks to pass before merging
- [ ] Status checks required: select the CI workflow added by slice 0.3
- [ ] ✅ Require branches to be up to date before merging (recommended)
- [ ] ❌ Do NOT allow force pushes
- [ ] ❌ Do NOT allow deletions

Deferred until **after slice 0.3** because there's no CI to require until
then. Doing this earlier would make 0.3 itself unmergeable.

---

## 5. Before slice 1.2 — Admin user credentials

The seed script creates the single admin user (you).

- [ ] Pick a strong password and store it in your password manager
- [ ] Add to `.env.local`:
    ```
    ADMIN_EMAIL="your@email.com"
    ADMIN_PASSWORD="<strong-password>"
    ```
- [ ] Add the same to Vercel env vars (Production scope only — Preview can use a throwaway test value if you want)
- [ ] Never commit either value

### Local demo data (optional, dev only)

After `pnpm db:seed` (categories/cards/admin), load a few months of demo
expenses so the lists/dashboards have content:

```
pnpm db:seed:dev
```

It's **re-runnable** — it wipes the admin user's expenses + movements and
reinserts a deterministic demo set (3 months across categories/cards, mixed
shared/solo) plus a few category budgets and a `monthlyIncome`. **Local/dev
only** — never run it against production (`prisma/seed-dev.ts`).

### Seeding production (manual one-shot)

`prisma migrate deploy` (the prod build step) applies migrations but **does not
run the seed** — only `migrate dev`/`reset` auto-seed. So production tables are
empty until you seed them once, by hand, from your machine:

```bash
# after the first prod deploy has run migrate deploy
vercel env pull .env.production.local --environment=production  # gets DATABASE_URL + ADMIN_* for prod
pnpm db:seed:prod                                               # runs the seed against the prod DB
rm .env.production.local                                        # don't leave prod creds on disk
```

- The seed is **idempotent**, so re-run `pnpm db:seed:prod` whenever the
  category/card list in `docs/reference/domain-reference.md` changes — existing
  rows are left untouched, only new ones are added.
- `.env.production.local` is gitignored (`.env.*.local`); it holds **real prod
  credentials** — pull it only when seeding and delete it after.
- This writes directly to the production database. Double-check the pulled
  `DATABASE_URL` points at the Neon `production` branch before running.

---

## 6. Before slice 1.3 — Auth.js secret

Auth.js signs session tokens with this secret.

- [ ] Generate: `openssl rand -base64 32` (or `pnpm dlx auth secret` if Auth.js v5 CLI is available)
- [ ] Add to `.env.local`: `AUTH_SECRET="<generated>"`
- [ ] Add to Vercel env vars (Production + Preview — use a different value per environment if you want stronger isolation)
- [ ] If ever leaked: regenerate immediately, rotate the env var, redeploy — all active sessions will invalidate (acceptable for a single-user app; see ADR-0003)

---

## 7. Before slice 7.1 — Resend account _(deferred)_

Only needed when Phase 7 (Email Summary) is in flight. Many months out.

- [ ] Sign in at https://resend.com (free tier = 3,000 emails/month — plenty)
- [ ] Create an API key. Name it `fast-expense-tracker` so it's easy to revoke
- [ ] (Recommended) Verify a domain you own for the `from` address. Otherwise emails arrive with a `via resend.dev` suffix
- [ ] Add to `.env.local` and Vercel env: `RESEND_API_KEY="<key>"`
- [ ] Generate a `CRON_SECRET` (`openssl rand -hex 32`); add to `.env.local` + Vercel. Used by slice 7.3 to authenticate Vercel's cron requests.

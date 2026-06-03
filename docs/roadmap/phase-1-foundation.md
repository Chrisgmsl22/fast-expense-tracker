# Phase 1: Foundation

**Status**: 🟡 Active (Phase 0 complete) — **1.1 next up**
**Outcome**: Auth-gated app; capture / edit / delete expenses; chronological list with month filter. Deployable.
**Spec**: [`docs/specs/0001-initial-design.md` §7 — Phase 1](../specs/0001-initial-design.md)
**Slicing**: [`parallel-slicing.md`](../conventions/parallel-slicing.md) — F→Fan-out→I

The phase that turns the scaffold into "you can actually log expenses."
Auth lands here (non-negotiable per ADR-0003 since the deployed URL must
not be unauthenticated). All forward-compat schema fields land in 1.1
even though their UI ships in later phases (schema-forward principle —
spec §5).

## Prerequisites (manual)

Complete the relevant sections of [`docs/operations/setup.md`](../operations/setup.md) **before invoking the `implementer`**:

- Before **1.2** — §5 (admin credentials: `ADMIN_EMAIL`, `ADMIN_PASSWORD`)
- Before **1.3** — §6 (Auth.js secret: `AUTH_SECRET`)
- Before **1.7** — create a Sentry project (platform: Next.js), supply the **DSN**; enable **Speed Insights** in the Vercel dashboard (per [ADR-0005](../decisions/0005-error-tracking-and-observability.md))

## Slices

#### 1.1: Schema + Prisma client + Auth.js config + page shells `[PR]`

**Type**: Foundation
**Depends on**: 0.\*
**Status**: 🟢 Shipped on `feat/1.1-schema-auth-shells` (PR #9). Plan block → PR description. ADRs: [0007](../decisions/0007-nextjs16-proxy-convention.md).

Lands the full Prisma schema (User, Category, Subcategory, Card, Expense,
Settings) with all forward-compat fields. Wires Auth.js v5 config (no UI
yet). Creates empty page shells for `/login`, `/expenses`, `/settings`.

##### Tasks

- [x] Define `User` Prisma model (per spec §3 and domain-reference.md §2)
- [x] Define `Category`, `Subcategory` models
- [x] Define `Card` model
- [x] Define `Expense` model with **all** forward-compat fields:
    - `isRecurring Boolean @default(false)` (Phase 3)
    - `settlementStatus String @default("not_shared")` (Phase 2)
    - `paidAt DateTime?` (Phase 2)
    - `originalAmount Float?` (Phase 5)
    - `originalCurrency String?` (Phase 5)
- [x] Define `Settings` model (per spec §3)
- [x] Run migration; verify all tables created — applied to **local Docker** (ADR-0004); prod via `migrate deploy`
- [x] Install Auth.js v5; scaffold `auth.config.ts` + `auth.ts`
- [x] Create empty page shells: `app/(auth)/login/page.tsx`, `app/(dashboard)/expenses/page.tsx`, `app/(dashboard)/settings/page.tsx`
- [x] Create `proxy.ts` skeleton (Next.js 16 rename of `middleware.ts`, ADR-0007; no enforcement yet)
- [x] Tests: schema-shape (Prisma DMMF) + page-shell render tests

---

#### 1.2: Seed script `[PR]`

**Type**: Parallel (with 1.3, 1.4, 1.5)
**Depends on**: 1.1

Idempotent seed for categories, subcategories, cards, and the single
admin user (bcrypt-hashed password via env var).

##### Tasks

- [ ] Port 13 categories + subcategories from [`domain-reference.md §1`](../reference/domain-reference.md)
- [ ] Port 5 cards from [`domain-reference.md §4`](../reference/domain-reference.md) (Amex Platinum, Amex Gold, NU, BBVA, Cash)
- [ ] Create admin user with bcrypt-hashed password (set via `ADMIN_PASSWORD` env var; no fallback per ADR-0003)
- [ ] Make seed idempotent (re-runnable without dupes — use `upsert`)
- [ ] Document in `.env.example`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- [ ] Tests: seed runs cleanly; second run is a no-op

---

#### 1.3: Login UI + session middleware `[PR]`

**Type**: Parallel (with 1.2, 1.4, 1.5)
**Depends on**: 1.1

Builds the login flow. Resolves the **bcrypt vs argon2** and
**rate-limiting** open questions (with ADRs).

##### Tasks

- [ ] Decide bcrypt vs argon2 (ADR)
- [ ] Decide rate-limiting strategy: Vercel KV vs Upstash vs deferred (ADR)
- [ ] Build login form (email + password) at `/login`
- [ ] Configure Auth.js Credentials provider
- [ ] `middleware.ts`: whitelist `/login` and `/api/auth/*`; block everything else
- [ ] Logout action
- [ ] Tests: login success path, wrong password, missing fields, rate-limit (if implemented)

---

#### 1.4: Capture modal + create server action `[PR]`

**Type**: Parallel (with 1.2, 1.3, 1.5)
**Depends on**: 1.1

Builds the expense capture modal (Option B from brainstorming — modal on
the list page opened by a "+ Add" button).

##### Tasks

- [ ] `ExpenseForm` component with visible fields: date, amount, category, subcategory, card, description, notes, isShared, yourPercentage
- [ ] Hidden / defaulted: `isRecurring=false`, `settlementStatus` (auto from isShared), `originalAmount=null`, `originalCurrency=null`
- [ ] Zod schema in `lib/schemas/expense.ts`
- [ ] `createExpense` server action in `app/_actions/expense/create.ts`
- [ ] Compute `actualExpenditure = isShared ? amount * yourPercentage : amount` server-side
- [ ] "+ Add" button on `/expenses` page opens modal
- [ ] Tests: schema validation, server-action happy path + error paths, component render

---

#### 1.5: List view + month filter `[PR]`

**Type**: Parallel (with 1.2, 1.3, 1.4)
**Depends on**: 1.1

Renders the expense list with month filtering.

##### Tasks

- [ ] `getExpensesForMonth(userId, monthYear)` service in `lib/services/expense/`
- [ ] `/expenses` page: server component, fetches data, renders `ExpenseList`
- [ ] `ExpenseList` component: reverse-chronological table
- [ ] Month picker component (defaults to current month per CDMX local time)
- [ ] URL param sync (`?month=2026-05`)
- [ ] Tests: service unit, page integration

---

#### 1.6: Edit + delete + Playwright smoke `[PR]`

**Type**: Integration
**Depends on**: 1.4, 1.5

Wires edit + delete onto the list, adds the e2e test that proves the
phase shipped.

##### Tasks

- [ ] Edit: click row → opens `ExpenseForm` in modal pre-filled
- [ ] `updateExpense` server action
- [ ] Delete: button on row → confirm dialog → delete
- [ ] `deleteExpense` server action
- [ ] Playwright e2e: login → create expense → edit it → delete it → logout
- [ ] Tests: update + delete server actions

---

#### 1.7: Observability — Sentry + Speed Insights `[PR]`

**Type**: Parallel (independent of 1.2–1.6; runnable any time after 1.1)
**Depends on**: 1.1
**Decision**: [ADR-0005](../decisions/0005-error-tracking-and-observability.md)

> **Stub — Plan block to be written when this slice goes next-up.** Slice
> number/ordering is provisional (placed after the 1.6 integration only
> because it is independent of it). Scope below is the intended shape, not a
> committed Plan block.

Wires production error tracking (Sentry, primary) + real-user Web Vitals
(Vercel Speed Insights, secondary). Touches root layout + config + env only —
no feature surface, hence parallel-capable. **Prerequisite**: Sentry project
created + DSN supplied (see Prerequisites above). v1 skips source-map upload
(no `SENTRY_AUTH_TOKEN` yet) — errors captured with minified frames; source
maps added later.

##### Tasks (provisional)

- [ ] Install `@sentry/nextjs`; run the wizard / hand-write client + server + edge configs
- [ ] Read DSN from `process.env` (`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`); inert if unset — no hardcoded DSN
- [ ] Install `@vercel/speed-insights`; add `<SpeedInsights />` to the root layout
- [ ] Add a `/sentry-test` (or equivalent) route to prove capture end-to-end, then remove or gate it
- [ ] Document `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN` in `.env.example` (placeholders) + `coding-conventions.md`; note `SENTRY_AUTH_TOKEN` as deferred (Vercel-only secret)
- [ ] Add the Sentry/Speed Insights prerequisite steps to `docs/operations/setup.md`
- [ ] Tests: error boundary / server-action error reaches Sentry config path; build succeeds with DSN unset

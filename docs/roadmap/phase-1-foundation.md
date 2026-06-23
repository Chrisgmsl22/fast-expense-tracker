# Phase 1: Foundation

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

Lands the full Prisma schema (User, Category, Subcategory, Card, Expense,
Settings) with all forward-compat fields. Wires Auth.js v5 config (no UI
yet). Creates empty page shells for `/login`, `/expenses`, `/settings`. The
Next.js 16 route-protection convention is recorded in
[ADR-0007](../decisions/0007-nextjs16-proxy-convention.md).

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

Idempotent seed for categories, subcategories, cards, and the single
admin user (bcrypt-hashed password via env var).

##### Tasks

- [x] Port 13 categories + subcategories from [`domain-reference.md §1`](../reference/domain-reference.md)
- [x] Port 5 cards from [`domain-reference.md §4`](../reference/domain-reference.md) (Amex Platinum, Amex Gold, NU, BBVA, Cash)
- [x] Create admin user with bcrypt-hashed password (set via `ADMIN_PASSWORD` env var; no fallback per ADR-0003)
- [x] Make seed idempotent (re-runnable without dupes — `upsert` for category/user; find-then-create for subcategory/card, which have no natural unique key)
- [x] Document in `.env.example`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- [x] Tests: seed runs cleanly; second run is a no-op

---

#### 1.3: Login UI + session middleware `[PR]`

Builds the login flow. Resolved the **bcrypt vs argon2** and
**rate-limiting** open questions in [ADR-0009](../decisions/0009-login-credential-security.md).

##### Tasks

- [x] ADR-0009: bcryptjs (matches seed) + rate-limiting deferred
- [x] `loginSchema` + `LoginInput` in `lib/schemas/auth.ts`
- [x] `user.service.ts`: `getUserByEmail` + `verifyCredentials`
- [x] `auth.ts`: Credentials provider wired to `verifyCredentials`
- [x] `auth.config.ts`: `authorized` whitelist + `jwt`/`session` callbacks (`token.sub` carries the user id — no `JWT` augmentation needed)
- [x] Login form at `/login` (email + password) + `loginAction`
- [x] Logout action + button in the dashboard layout
- [x] Tests: schema, `verifyCredentials` (success / wrong password / unknown), `loginAction` (validation / invalid / non-credentials error / redirect)

---

#### 1.4: Capture modal + create server action `[PR]`

Builds the expense capture modal (Option B from brainstorming — modal on
the list page opened by a "+ Add" button).

##### Tasks

- [x] `ExpenseForm` component with visible fields: date, amount, category, subcategory, card, description, notes, isShared, yourPercentage, **`paidBy`** (you/gf — per [spec 0003](../specs/0003-shared-expense-settlement.md); depends on 1.8)
- [x] Hidden / defaulted: `isRecurring=false`, `originalAmount=null`, `originalCurrency=null` (no `settlementStatus` — dropped in 1.8 per 0003)
- [x] Zod schema in `lib/schemas/expense.ts`
- [x] `createExpense` server action in `app/_actions/expense/create.ts`
- [x] Compute `actualExpenditure = isShared ? amount * yourPercentage : amount` server-side
- [x] "+ Add" button on `/expenses` page opens modal
- [x] Tests: schema validation, server-action happy path + error paths, component render

---

#### 1.5: List view + month filter `[PR]`

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

Decision recorded in [ADR-0005](../decisions/0005-error-tracking-and-observability.md).

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

---

#### 1.8: Settlement schema — `paidBy` + `Movement` `[PR]`

Schema-only slice adopting [spec 0003](../specs/0003-shared-expense-settlement.md) — the
bidirectional-settlement redesign that wasn't anticipated when 1.1 froze the
schema. A late, additive foundation slice: it changes the **shape** that
capture (1.4/1.6) and the Phase 2 settlement/Phase 4 stats build on, so it
lands before them. No UI, no balance logic, no graphs here.

##### Tasks

- [x] Add `paidBy String @default("you")` to `Expense`
- [x] Add the `Movement` model (`date`, `amount`, `type`, `cardId?`, `note`, relations) per 0003 §3.2
- [x] Drop `Expense.settlementStatus` and `Expense.paidAt` (confirmed empty table first)
- [x] Generate + apply the migration to local Docker; `prisma generate`
- [x] Update the schema-shape DMMF test: `Expense` has `paidBy`, lacks `settlementStatus`/`paidAt`; `Movement` exists with its fields
- [x] Tests green; lint + typecheck clean

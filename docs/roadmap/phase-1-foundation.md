# Phase 1: Foundation

**Status**: 🔒 Locked (Phase 0 must ship first)
**Outcome**: Auth-gated app; capture / edit / delete expenses; chronological list with month filter. Deployable.
**Spec**: [`docs/specs/0001-initial-design.md` §7 — Phase 1](../specs/0001-initial-design.md)
**Slicing**: [`parallel-slicing.md`](../conventions/parallel-slicing.md) — F→Fan-out→I

The phase that turns the scaffold into "you can actually log expenses."
Auth lands here (non-negotiable per ADR-0003 since the deployed URL must
not be unauthenticated). All forward-compat schema fields land in 1.1
even though their UI ships in later phases (schema-forward principle —
spec §5).

## Slices

#### 1.1: Schema + Prisma client + Auth.js config + page shells `[PR]`

**Type**: Foundation
**Depends on**: 0.*

Lands the full Prisma schema (User, Category, Subcategory, Card, Expense,
Settings) with all forward-compat fields. Wires Auth.js v5 config (no UI
yet). Creates empty page shells for `/login`, `/expenses`, `/settings`.

##### Tasks

- [ ] Define `User` Prisma model (per spec §3 and domain-reference.md §2)
- [ ] Define `Category`, `Subcategory` models
- [ ] Define `Card` model
- [ ] Define `Expense` model with **all** forward-compat fields:
  - `isRecurring Boolean @default(false)` (Phase 3)
  - `settlementStatus String @default("not_shared")` (Phase 2)
  - `paidAt DateTime?` (Phase 2)
  - `originalAmount Float?` (Phase 5)
  - `originalCurrency String?` (Phase 5)
- [ ] Define `Settings` model (per spec §3)
- [ ] Run migration; verify all tables created on Neon
- [ ] Install Auth.js v5; scaffold `auth.config.ts` + `auth.ts`
- [ ] Create empty page shells: `app/(auth)/login/page.tsx`, `app/(dashboard)/expenses/page.tsx`, `app/(dashboard)/settings/page.tsx`
- [ ] Create `middleware.ts` skeleton (no logic yet)
- [ ] Tests: schema-validation tests that the migration produces expected columns

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

# Spec 0001: Initial Design

**Status**: Accepted
**Date**: 2026-05-25
**Supersedes**: —
**Related**: [ADR-0001](../decisions/0001-tech-stack.md) · [ADR-0002](../decisions/0002-agent-led-development.md) · [ADR-0003](../decisions/0003-env-secrets-handling.md) · [domain-reference.md](../reference/domain-reference.md)

This spec captures the design that came out of the planning session on
2026-05-25. It defines what fast-expense-tracker is, what it isn't, how the
work is sliced, and the order in which features ship. It is the source of
truth that the per-phase files in `docs/roadmap/` reference.

If a phase file disagrees with this spec, this spec wins until a successor
spec is written.

---

## 1. Vision

A temporary, agent-led personal expense tracker that gets the user from
"logging expenses in a spreadsheet" to a deployed, mobile-friendly,
secret-clean web app within ~2-3 months of calendar time. Built while
MoneyFlow (the long-form learning project) is paused.

**Concrete target audience**: one user (the project owner) in CDMX, MXN-first,
weekly Monday-morning review ritual, occasional mobile entry.

**Success at the trajectory level**:

- Phase 1 ships → user logs expenses on phone/laptop behind a real auth gate.
- Phase 2 ships → user does the weekly Sunday/Monday review entirely in the
  app (settles up with girlfriend, sees what's spent / saved / left).
- Phase 4 ships → user has a real dashboard; the app is "Path C" from the
  brainstorming session.
- Phase 7 ships → a Monday-morning email summary lands automatically.

The app's life expectancy is "until MoneyFlow ships." At that point its data
migrates via `pg_dump | pg_restore` into MoneyFlow's schema (see
[domain-reference.md §6](../reference/domain-reference.md)) and this app is
archived.

---

## 2. Operating model

Mode 2 by default (agents implement, user reviews). Two persistent named
subagents: `implementer` and `reviewer`. Same code-quality bar as MoneyFlow.

See [ADR-0002](../decisions/0002-agent-led-development.md) for the rationale
and [agent-workflow.md](../conventions/agent-workflow.md) for the per-slice
handoff format.

### Slicing approach

This repo extends the standard MoneyFlow vertical-slice pattern with a
**Foundation → Fan-out → Integration** structure inside each phase:

- **Foundation slice** (1 per phase, sequential): lands data model + types +
  page shells + shared utils. Unblocks the rest of the phase.
- **Fan-out slices** (2-4 per phase, parallelizable): each touches disjoint
  files so multiple agents can work concurrently without merge conflicts.
- **Integration slice** (1 per phase, sequential after fan-out): wires loose
  ends, adds end-to-end Playwright smoke test, validates the phase's
  feature works end-to-end.

The full conventions (file-boundary rules, when to add a Foundation slice,
how to grow parallelism beyond 2) live in
[parallel-slicing.md](../conventions/parallel-slicing.md) — written
alongside this spec.

**Parallelism degree for v1**: 2 agents simultaneously. The DAG is designed
to allow more later if the user's review bandwidth grows.

---

## 3. Domain model

The schema mirrors a subset of MoneyFlow's Prisma schema so that final
migration is `pg_dump | pg_restore` + one translation script. The full
domain model — categories, cards, shared-expense math — lives in
[domain-reference.md](../reference/domain-reference.md).

### Deltas from domain-reference.md

The reference doc was written before this spec and excluded several fields
under YAGNI. The planning session re-added some of them. The Phase 1 schema
migration includes ALL of the following, even when the UI exposing them
ships in a later phase (schema-forward principle — see §5):

#### Re-added to `Expense`

| Field              | Type                                                                          | Reason re-added                  | UI lands in |
| ------------------ | ----------------------------------------------------------------------------- | -------------------------------- | ----------- |
| `isRecurring`      | `Boolean @default(false)`                                                     | Recurring expense templates (Q6) | Phase 3     |
| `settlementStatus` | `String @default("not_shared")` — values `not_shared` / `pending` / `settled` | Settlement tracking (Q7)         | Phase 2     |
| `paidAt`           | `DateTime?`                                                                   | Companion to `settlementStatus`  | Phase 2     |
| `originalAmount`   | `Float?`                                                                      | Multi-currency reference (Q8)    | Phase 5     |
| `originalCurrency` | `String?`                                                                     | Multi-currency reference (Q8)    | Phase 5     |

#### New model: `Settings`

A single-row config table (one row, tied to the single user) for runtime
configuration that shouldn't be a redeploy.

```prisma
model Settings {
  id                       String   @id @default(uuid())
  userId                   String   @unique
  user                     User     @relation(fields: [userId], references: [id])

  monthlyIncome            Float    @default(0)
  defaultSharePercentage   Float    @default(0.68)
  emailDay                 Int      @default(1)        // 0=Sun, 1=Mon, ..., 6=Sat
  recurringPromptSuppressed Boolean @default(false)

  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
}
```

#### `Category.monthlyBudget`

Already in domain-reference.md as a per-category nullable Float; no change.

### Time and dates

- **Storage**: all `DateTime` columns are stored in UTC (Postgres
  `TIMESTAMPTZ`, Prisma `DateTime`).
- **Display**: rendered in `America/Mexico_City` (UTC-6, no DST).
- **Date entry**: capture form accepts dates in local CDMX time and the
  server-action layer converts to UTC before insert.
- **"Month" semantics**: a month boundary is defined by `America/Mexico_City`
  local time, not UTC. The string format for month filters and `monthYear`
  fields is `YYYY-MM` (no zone — interpreted as CDMX local).
- Time-zone configuration is **not** a runtime setting (see §4 non-goals).

### Multi-currency canonical-amount convention

`amount` on `Expense` is **always in MXN** (the canonical budgeting truth).
For foreign-currency expenses:

- `originalCurrency` is set to e.g. `"USD"`.
- `originalAmount` holds the original-currency value.
- `amount` holds the MXN-equivalent (taken from the bank statement).
- Display: `$45 USD ($810 MXN)`. All totals/queries use `amount` directly,
  no special cases.

Migration to MoneyFlow's `(amount, currency)` schema is a one-translation
script: if `originalCurrency` is non-null, swap `amount`/`currency` to
match. Otherwise pass through with `currency = "MXN"`.

### Settlement convention

> ⚠️ **Superseded by [`0003-shared-expense-settlement.md`](./0003-shared-expense-settlement.md).**
> The one-directional model below (per-expense `settlementStatus`, "Owed to you"
> only, reverse case faked via a category) is replaced by a bidirectional **couple
> balance** + a **Movement** log, with `settlementStatus`/`paidAt` dropped. Kept
> here for historical context.

When `isShared = true` is set on create/edit, `settlementStatus` defaults
to `"pending"`. When `isShared = false`, it's `"not_shared"`. The
"Settle up" action sets `settlementStatus = "settled"` and
`paidAt = now()`.

The settlement view computes "Owed to you" as
`sum(amount − actualExpenditure)` across all rows where
`settlementStatus = "pending"`. After settle-up, those rows drop out of
the total.

Reverse settlement (girlfriend paid the merchant, user owes her) is **out
of scope** — handled via the "Combined Expenses" category as it currently
exists in the seed.

### Recurring convention

`isRecurring` is set per-expense-row, not on a separate template table.
The "template" is implicit: the previous month's recurring rows.

Month-rollover behavior:

1. User navigates to a month they haven't been prompted for yet. (This
   condition is independent of whether the month has any expenses logged —
   the modal can still fire on a month with manual entries, as long as
   the user hasn't seen the prompt for that month.)
2. App queries: do any rows in the previous month have `isRecurring = true`?
3. If yes (and `Settings.recurringPromptSuppressed` is false), show modal:
   "Last month you marked N expenses as recurring. Auto-add to [Month]?"
   with `[Add them]` · `[Skip]` · `[Don't show again]`.
4. On `[Add]`: clone the previous month's recurring rows into the new month
   with `date` shifted +1 month (last-day-of-month clamped for the 28-31 case),
   all other fields copied, `isRecurring` cascading to `true`. Reveal animation.
5. On `[Skip]`: dismiss; mark the month as prompted so it doesn't fire again.
6. On `[Don't show again]`: set `Settings.recurringPromptSuppressed = true`.
   Re-enable from Settings page.

The modal fires at most once per `(user, month)` regardless of which option
was chosen. The mechanism for tracking which months have been prompted (e.g.,
a `lastPromptedMonth` field on `Settings`, a separate `MonthPromptLog`
table, or local-storage) is intentionally not fixed here — resolved in
slice 3.4.

After cloning, the rows are normal `Expense` rows — editable, deletable.

In list view, rows with `isRecurring = true` display a "Recurring" badge.

---

## 4. Feature scope

### In scope (full trajectory across 8 phases)

| Feature                                                          | First lands in |
| ---------------------------------------------------------------- | -------------- |
| Auth (single-user Credentials login)                             | Phase 1        |
| Expense capture (modal form)                                     | Phase 1        |
| Expense list (chronological + month filter)                      | Phase 1        |
| Edit / delete expense                                            | Phase 1        |
| Top-line numeric summary (Spent / Saved / Remaining)             | Phase 2        |
| Category rollup table                                            | Phase 2        |
| Settlement workflow ("Owed to you" + Settle-up modal)            | Phase 2        |
| Settings page (income, default %, per-cat budgets, email day)    | Phase 2        |
| Recurring-expense flag + month-rollover modal + clone logic      | Phase 3        |
| Dashboard with charts (50/25/25, by-category donut, by-card bar) | Phase 4        |
| Subcategory drilldown                                            | Phase 4        |
| Multi-currency (MXN canonical, USD/EUR as reference)             | Phase 5        |
| Mobile polish + PWA install + capture-form responsive split      | Phase 6        |
| Weekly email summary (Resend, cron, configurable day)            | Phase 7        |

### Out of scope (final list — overrides earlier YAGNI in domain-reference.md)

- Bulk CSV import (manual or DB-side only, at MoneyFlow migration time)
- Receipt photo upload or OCR
- Bank sync (Plaid, Belvo, etc.)
- Settlement direction reversal (GF paid merchant → user owes her);
  handled via "Combined Expenses" category only
- Currency display switching (totals always in MXN; no per-user display
  currency)
- Card balance ledger / payments-into-card tracking (per-card _charges_
  breakdown lives in Phase 4 dashboard; payments-to-card stay in the
  user's bank app)
- Multi-user (single user — the project owner)
- AI categorization
- Push notifications (email only)
- Debt tracking, Goal tracking, per-month Budget table (all deferred to
  MoneyFlow)
- Time-zone configuration (CDMX fixed; storage UTC, display
  `America/Mexico_City`)
- Audit / edit-history log

---

## 5. Schema-forward principle

Phase 1's migration introduces all schema columns that any future phase
needs — `isRecurring`, `settlementStatus`, `paidAt`, `originalAmount`,
`originalCurrency`, and the `Settings` model. UI exposing these fields
ships in their respective later phases.

Rationale: a one-line migration adding a nullable/defaulted column at
Phase 1 is essentially free. Migrating live data in a later phase requires
backfill logic and risks subtle bugs. Front-loading the columns trades
near-zero schema cost for zero migration risk later.

---

## 6. Phase trajectory

| #     | Name           | Outcome                                                                         | Rough effort |
| ----- | -------------- | ------------------------------------------------------------------------------- | ------------ |
| **0** | Bootstrap      | Empty Next.js app live on Vercel; CI green; Prisma schema scaffolded            | ~1 week      |
| **1** | Foundation     | Auth-gated app; capture/edit/delete expenses; chronological list + month filter | ~2-3 weeks   |
| **2** | Weekly Review  | Summary numbers + category rollup + settlement workflow + settings page         | ~2-3 weeks   |
| **3** | Recurring      | Recurring checkbox + month-rollover modal + clone logic + badge                 | ~1-2 weeks   |
| **4** | Dashboard      | 50/25/25 progress + by-category donut + by-card bar + subcategory drilldown     | ~2 weeks     |
| **5** | Multi-currency | USD/EUR capture with MXN equivalent; reference-only foreign display             | ~1 week      |
| **6** | Mobile Polish  | FAB + optimistic UI + PWA install + inline/modal responsive split               | ~1-2 weeks   |
| **7** | Email Summary  | Weekly Resend cron with summary email; day configurable from Settings           | ~1 week      |

### Ordering rationale

- **0 first**: table stakes; everything depends on the scaffold.
- **1 before everything UI**: auth is non-negotiable per ADR-0003 (the
  repo is public, the URL must be gated).
- **2 before 3**: settlement is a _weekly_ ritual; recurring is _monthly_.
  Weekly need is louder. Also, Phase 2 lands the Settings page which
  Phase 3 extends.
- **3 before 4**: recurring rows must already exist before the dashboard
  visualizes them, otherwise the dashboard ships needing immediate retrofit.
- **4 before 5**: dashboard works fine on single-currency data;
  multi-currency just adds one more dimension that's easier to add to an
  existing dashboard than to design around upfront.
- **5 before 6**: multi-currency is a _capture_ feature (form field);
  mobile polish is a _layout_ concern. Capture changes first so mobile
  polish targets the final form shape.
- **7 last**: truly optional. If by Phase 6 the user has moved on to
  MoneyFlow, Phase 7 can be skipped.

---

## 7. Per-phase slice plans

Each slice = one PR. Slice IDs are stable references for `implementer`
invocations. Each phase file in `docs/roadmap/` carries the per-slice task
lists; this section lists slice IDs, types, and dependencies.

### Phase 0 — Bootstrap (4 slices)

| #   | Slice                                                                                    | Type           | Dependencies |
| --- | ---------------------------------------------------------------------------------------- | -------------- | ------------ |
| 0.1 | Next.js + TS-strict + Tailwind + shadcn/ui + Prisma + Neon + empty migration baseline    | **Foundation** | —            |
| 0.2 | Vercel deploy hookup                                                                     | Parallel       | 0.1          |
| 0.3 | GitHub Actions CI (lint + typecheck + Vitest + Playwright skeleton + `.env*` grep guard) | Parallel       | 0.1          |
| 0.4 | Pre-commit hook (resolves Husky vs lefthook open question)                               | Parallel       | 0.1          |

No Integration slice — Phase 0 is infrastructure; "feature works end-to-end"
isn't applicable. The Vercel preview URL loading + CI green from 0.2/0.3
serves as integration verification.

### Phase 1 — Foundation (6 slices)

| #   | Slice                                                                                                                                                      | Type            | Dependencies |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------ |
| 1.1 | Full schema migration (User, Category, Subcategory, Card, Expense with all forward-compat fields, Settings) + Prisma client + Auth.js config + page shells | **Foundation**  | 0.\*         |
| 1.2 | Seed script (13 categories + subcategories, 5 cards, admin user with bcrypt-hashed password)                                                               | Parallel        | 1.1          |
| 1.3 | Login UI + session middleware (resolves bcrypt vs argon2 open question; rate-limit decision in ADR)                                                        | Parallel        | 1.1          |
| 1.4 | Expense capture modal + create server action                                                                                                               | Parallel        | 1.1          |
| 1.5 | Expense list view + month filter + reverse-chronological table                                                                                             | Parallel        | 1.1          |
| 1.6 | Edit + delete (confirm prompt) + Playwright smoke test (login → create → edit → delete)                                                                    | **Integration** | 1.4, 1.5     |

### Phase 2 — Weekly Review (6 slices)

> **Superseded by [ADR-0013](../decisions/0013-screen-driven-reslice.md).** This
> pre-design widget decomposition was re-sliced screen-by-screen against
> `Confirmed designs V1`. Live plan: [`ui-build-plan.md`](../roadmap/ui-build-plan.md)
>
> - [`phase-2-screens.md`](../roadmap/phase-2-screens.md). Kept for history.

| #   | Slice                                                                                                                                             | Type            | Dependencies |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------ |
| 2.1 | `Settings` already in schema from 1.1; this slice adds `getMonthSummary(userId, monthYear)` server util skeleton + summary header component shell | **Foundation**  | 1.\*         |
| 2.2 | Settings page UI (forms for monthlyIncome, defaultSharePercentage, per-category monthlyBudget, emailDay)                                          | Parallel        | 2.1          |
| 2.3 | Top-line summary widget (Spent / Saved / Remaining cards)                                                                                         | Parallel        | 2.1          |
| 2.4 | Category rollup table (extends `getMonthSummary` with `byCategory[]`)                                                                             | Parallel        | 2.1          |
| 2.5 | Settlement: auto-default `settlementStatus` on create/edit + per-row pending/settled badges in list + "Owed to you" card in summary header        | Parallel        | 2.1          |
| 2.6 | Settle-up modal with bulk-select + e2e test (create shared expense → settle up → verify "Owed to you" drops)                                      | **Integration** | 2.5          |

### Phase 3 — Recurring (4 slices)

| #   | Slice                                                                                                                                | Type            | Dependencies  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------- |
| 3.1 | "Recurring?" checkbox in capture/edit modal + "Recurring" badge in list view rows                                                    | **Foundation**  | 1.4, 1.5, 1.6 |
| 3.2 | `getRecurringForCloning(userId, prevMonth)` server util + month-rollover detection (navigation hook to detect new-month-first-visit) | Parallel        | 3.1           |
| 3.3 | "Don't show again" via `Settings.recurringPromptSuppressed` + Settings page toggle to re-enable                                      | Parallel        | 2.2           |
| 3.4 | Modal + clone-with-date-shift logic (last-day-of-month clamping) + reveal animation + e2e test                                       | **Integration** | 3.2, 3.3      |

### Phase 4 — Dashboard (5 slices)

> **Retired — absorbed into Phase 2 by [ADR-0013](../decisions/0013-screen-driven-reslice.md).**
> The dashboard became [`phase-2-screens.md` §2.4](../roadmap/phase-2-screens.md)
> (by-category chart is a **radar**, not a donut) and subcategory drilldown became
> the Category-detail screen (§2.5). Kept for history.

| #   | Slice                                                                                                                         | Type            | Dependencies |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------ |
| 4.1 | `/dashboard` route + base 4-card layout + chart library decision (resolves ADR-0001 open question) + 50/25/25 progress widget | **Foundation**  | 2.\*         |
| 4.2 | By-category donut chart                                                                                                       | Parallel        | 4.1          |
| 4.3 | By-card bar chart                                                                                                             | Parallel        | 4.1          |
| 4.4 | Month picker propagating to all charts                                                                                        | Parallel        | 4.1          |
| 4.5 | Subcategory drilldown (click donut category → modal/drawer with subcategory breakdown table) + e2e test                       | **Integration** | 4.2          |

### Phase 5 — Multi-currency (2 slices)

| #   | Slice                                                                                          | Type            | Dependencies |
| --- | ---------------------------------------------------------------------------------------------- | --------------- | ------------ |
| 5.1 | Currency picker (MXN/USD/EUR) + `originalAmount` field + Zod validation in capture/edit modal  | **Foundation**  | 1.4, 1.6     |
| 5.2 | Foreign-amount display in list / summary / dashboard (`$45 USD ($810 MXN)` pattern) + e2e test | **Integration** | 5.1          |

No fan-out for Phase 5; the work is too thin to split. Pure F→I.

### Phase 6 — Mobile Polish (5 slices)

| #   | Slice                                                                                 | Type            | Dependencies |
| --- | ------------------------------------------------------------------------------------- | --------------- | ------------ |
| 6.1 | Responsive layout audit + FAB component + `useMediaQuery` hook + base mobile patterns | **Foundation**  | 1._, 2._     |
| 6.2 | Capture form responsive split (inline-row on desktop ≥md breakpoint, modal on mobile) | Parallel        | 6.1          |
| 6.3 | Optimistic UI on capture / edit / delete (React 19 `useOptimistic`)                   | Parallel        | 6.1          |
| 6.4 | PWA manifest + install prompt + app icons                                             | Parallel        | 6.1          |
| 6.5 | Mobile regression sweep + Playwright mobile-viewport tests                            | **Integration** | 6.2, 6.3     |

### Phase 7 — Email Summary (4 slices)

| #   | Slice                                                                                                            | Type            | Dependencies |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------- | ------------ |
| 7.1 | Resend integration + env wiring (`RESEND_API_KEY`) + React Email template scaffold                               | **Foundation**  | 2.\*         |
| 7.2 | Email template content (Spent/Saved/Remaining + top 3 categories from `getMonthSummary`) + preview route for dev | Parallel        | 7.1          |
| 7.3 | Vercel cron job + summary-computation + `Settings.emailDay` honored                                              | Parallel        | 7.1          |
| 7.4 | E2E test: trigger cron handler in test mode → verify email body matches expected content                         | **Integration** | 7.2, 7.3     |

### Slice count summary

| Phase     | Foundation | Fan-out | Integration | Total  |
| --------- | ---------- | ------- | ----------- | ------ |
| 0         | 1          | 3       | 0           | 4      |
| 1         | 1          | 4       | 1           | 6      |
| 2         | 1          | 4       | 1           | 6      |
| 3         | 1          | 2       | 1           | 4      |
| 4         | 1          | 3       | 1           | 5      |
| 5         | 1          | 0       | 1           | 2      |
| 6         | 1          | 3       | 1           | 5      |
| 7         | 1          | 2       | 1           | 4      |
| **Total** | **8**      | **21**  | **7**       | **36** |

At 2-agent parallelism, the practical review cadence is ~22 review moments
(Foundation and Integration are sequential bottlenecks; Fan-out slices
share the parallel budget). Estimated calendar time ≈ 10-12 weeks if the
user reviews 2-3 PRs per week.

---

## 8. Open questions deferred to their slices

These are decisions intentionally not made in this spec. Each will be
resolved in the slice listed, with an ADR if the trade-off warrants one.

| Question                                               | Resolved in slice | ADR likely? |
| ------------------------------------------------------ | ----------------- | ----------- |
| Pre-commit hook: Husky vs lefthook                     | 0.4               | Yes         |
| Password hashing: bcrypt vs argon2                     | 1.3               | Yes         |
| Rate-limiting login: Vercel KV / Upstash / deferred    | 1.3               | Yes         |
| Chart library: Recharts vs Tremor vs visx              | 4.1               | Yes         |
| Last-prompted-month tracking model for recurring modal | 3.4               | Maybe       |

---

## 9. Done definition per phase

A phase is "shipped" when:

1. All slices in the phase are merged to `main`.
2. CI is green on `main` (lint, typecheck, Vitest, Playwright skeleton).
3. The phase's Integration slice's e2e test (where applicable) passes.
4. `docs/roadmap/README.md` reflects the phase as 🟢 Complete.
5. The user has manually verified the phase's user-facing feature in the
   deployed Vercel preview / production.

A slice is "shipped" when:

1. Code + tests written, lint + typecheck + Vitest + relevant Playwright
   pass locally.
2. `reviewer` subagent run, all Critical / Important items resolved.
3. Slice-lifecycle cleanup done (tasks `[x]`, Plan block copied to PR
   description, Plan block deleted from phase file) — all in the same PR.
4. PR opened, user reviews, merge.

---

## 10. References

- [CLAUDE.md](../../CLAUDE.md) — top-level project guide
- [ADR-0000](../decisions/0000-using-adrs.md) — Using ADRs
- [ADR-0001](../decisions/0001-tech-stack.md) — Tech stack (Next.js + Neon + Vercel)
- [ADR-0002](../decisions/0002-agent-led-development.md) — Agent-led development with named subagents
- [ADR-0003](../decisions/0003-env-secrets-handling.md) — Env and secret handling
- [domain-reference.md](../reference/domain-reference.md) — Categories, schema, shared-expense math
- [coding-conventions.md](../conventions/coding-conventions.md)
- [slice-planning.md](../conventions/slice-planning.md) — Per-slice Plan block format
- [pr-strategy.md](../conventions/pr-strategy.md) — How work is sliced into PRs
- [agent-workflow.md](../conventions/agent-workflow.md) — Subagent invocation
- [parallel-slicing.md](../conventions/parallel-slicing.md) — F→Fan-out→I pattern (written alongside this spec)
